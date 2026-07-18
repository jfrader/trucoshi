#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TRUCOSHI_CLIENT_DIR="$(cd "$ROOT_DIR/../trucoshi-client" 2>/dev/null && pwd || true)"
DEV_ALL_LINK_DIR="$ROOT_DIR/.dev-all-yarn-links"
NODE_ENV="${NODE_ENV:-development}"
DEV_ALL_DOCKER_SUDO="${DEV_ALL_DOCKER_SUDO:-0}"

PIDS=()
CLEANING_UP=0
SUDO_KEEPALIVE_PID=""

log() {
  echo "[dev:all] $*"
}

fail() {
  echo "[dev:all] ERROR: $*" >&2
  exit 1
}

require_not_root() {
  if [ "${EUID:-$(id -u)}" -eq 0 ]; then
    fail "Do not run this script with sudo. Use yarn dev:all:sudo-docker so only Docker runs with sudo."
  fi
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

read_dotenv_value() {
  local file="$1"
  local key="$2"

  node -e '
    const { readFileSync } = require("node:fs");
    const { parseEnv } = require("node:util");
    const [file, key] = process.argv.slice(1);
    const value = parseEnv(readFileSync(file, "utf8"))[key];
    if (value !== undefined) process.stdout.write(value);
  ' "$file" "$key"
}

require_bearer_token() {
  local key="$1"
  local value="$2"

  [ -n "$value" ] || fail "Set $key in $ROOT_DIR/.env"
  case "$value" in
    *[[:space:]]*) fail "$key in $ROOT_DIR/.env must not contain whitespace" ;;
  esac
}

use_sudo_docker() {
  [ "$DEV_ALL_DOCKER_SUDO" = "1" ] || [ "$DEV_ALL_DOCKER_SUDO" = "true" ]
}

require_project() {
  local name="$1"
  local dir="$2"

  if [ -z "$dir" ] || [ ! -f "$dir/package.json" ]; then
    fail "Expected $name at $dir with package.json"
  fi
}

ensure_development_env() {
  if [ -f "$ROOT_DIR/.env" ]; then
    return
  fi

  [ -f "$ROOT_DIR/.env.example" ] || fail "Missing $ROOT_DIR/.env.example"
  log "Creating .env from local development defaults..."
  install -m 600 "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
}

run_in() {
  local dir="$1"
  shift

  log "Running in $dir: $*"
  (cd "$dir" && "$@")
}

docker_compose() {
  local dir="$1"
  local node_env="$2"
  shift 2

  log "Running Docker Compose in $dir with NODE_ENV=$node_env: docker compose $*"
  if use_sudo_docker; then
    (cd "$dir" && sudo -n env NODE_ENV="$node_env" docker compose "$@")
  else
    (cd "$dir" && env NODE_ENV="$node_env" docker compose "$@")
  fi
}

docker_command() {
  log "Running Docker: docker $*"
  if use_sudo_docker; then
    sudo -n docker "$@"
  else
    docker "$@"
  fi
}

start_process() {
  local name="$1"
  local dir="$2"
  shift 2

  log "Starting $name..."
  (cd "$dir" && "$@") &
  PIDS+=("$!")
}

start_trucoshi_client() {
  local status_token="$1"
  local bets_enabled="$2"
  local cookie_prefix="$3"

  log "Starting trucoshi-client Vite..."
  (
    cd "$TRUCOSHI_CLIENT_DIR"
    export TRUCOSHI_SERVER_URL="http://localhost:2992"
    export TRUCOSHI_OPS_STATUS_TOKEN="$status_token"
    export VITE_APP_HOST="http://localhost:2992"
    export VITE_LIGHTNING_ACCOUNTS_URL="http://localhost:2999/v1"
    export VITE_LIGHTNING_ACCOUNTS_COOKIE_PREFIX="$cookie_prefix"
    export VITE_ENABLE_BETS_AND_DEPOSITS="$bets_enabled"
    exec yarn start --host --force --port 2991 --strictPort
  ) &
  PIDS+=("$!")
}

start_docker_compose_process() {
  local name="$1"
  local dir="$2"
  local node_env="$3"
  shift 3

  log "Starting $name..."
  if use_sudo_docker; then
    (cd "$dir" && sudo -n env NODE_ENV="$node_env" docker compose "$@") &
  else
    (cd "$dir" && env NODE_ENV="$node_env" docker compose "$@") &
  fi
  PIDS+=("$!")
}

authenticate_sudo_docker() {
  if ! use_sudo_docker; then
    return
  fi

  log "Authenticating sudo for Docker commands..."
  if [ ! -r /dev/tty ]; then
    fail "Cannot authenticate sudo because /dev/tty is not readable"
  fi

  sudo -v < /dev/tty || fail "Could not authenticate sudo for Docker commands"

  (
    while true; do
      sudo -n true >/dev/null 2>&1 || exit
      sleep 60
    done
  ) &
  SUDO_KEEPALIVE_PID="$!"
}

kill_tree() {
  local pid="$1"
  local child

  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    kill_tree "$child"
  done

  kill "$pid" 2>/dev/null || true
}

cleanup() {
  local exit_code=$?

  if [ "$CLEANING_UP" -eq 1 ]; then
    exit "$exit_code"
  fi

  CLEANING_UP=1
  set +e

  log "Stopping dev processes..."
  if [ "${#PIDS[@]}" -gt 0 ]; then
    for pid in "${PIDS[@]}"; do
      kill_tree "$pid"
    done

    wait "${PIDS[@]}" 2>/dev/null
  fi

  log "Stopping combined Trucoshi development stack..."
  docker_compose \
    "$ROOT_DIR" \
    development \
    -f docker-compose.yml \
    -f docker-compose.dev-all-lightning-accounts.yml \
    down

  if [ -n "$SUDO_KEEPALIVE_PID" ]; then
    kill "$SUDO_KEEPALIVE_PID" 2>/dev/null || true
    wait "$SUDO_KEEPALIVE_PID" 2>/dev/null || true
  fi

  exit "$exit_code"
}

stop_trucoshi_stacks() {
  docker_compose \
    "$ROOT_DIR" \
    development \
    -f docker-compose.yml \
    -f docker-compose.dev-all-lightning-accounts.yml \
    down
  docker_compose "$ROOT_DIR" test -f docker-compose.yml -f docker-compose.e2e.yml down
  docker_compose "$ROOT_DIR" development -f docker-compose.yml -f docker-compose.e2e.yml down
}

ensure_writable_path() {
  local label="$1"
  local path="$2"
  local parent

  if [ -e "$path" ]; then
    if [ ! -w "$path" ]; then
      ls -ld "$path" >&2 || true
      fail "$label is not writable. Fix ownership once with: sudo chown -R $(id -u):$(id -g) \"$path\""
    fi
    return
  fi

  parent="$(dirname "$path")"
  if [ ! -w "$parent" ]; then
    ls -ld "$parent" >&2 || true
    fail "$label cannot be created because $parent is not writable. Fix ownership once with: sudo chown -R $(id -u):$(id -g) \"$parent\""
  fi
}

ensure_lightning_accounts_network() {
  local subnet

  if docker_command network inspect lightningaccountsnet >/dev/null 2>&1; then
    subnet="$(docker_command network inspect lightningaccountsnet --format '{{range .IPAM.Config}}{{println .Subnet}}{{end}}')"
    case "$subnet" in
      *10.29.0.0/24*) return ;;
      *) fail "Docker network lightningaccountsnet exists without subnet 10.29.0.0/24" ;;
    esac
  fi

  log "Creating shared Lightning Accounts development network..."
  docker_command \
    network create \
    --driver bridge \
    --attachable \
    --subnet 10.29.0.0/24 \
    lightningaccountsnet >/dev/null
}

wait_for_url() {
  local url="$1"
  local name="$2"
  local timeout_seconds="${3:-180}"
  local process_pid="${4:-}"
  local start

  start="$(date +%s)"
  log "Waiting for $name at $url..."

  while true; do
    if [ -n "$process_pid" ] && ! kill -0 "$process_pid" 2>/dev/null; then
      fail "The Docker Compose process exited before $name became ready at $url"
    fi

    if curl -fsS "$url" >/dev/null 2>&1; then
      break
    fi

    if [ "$(($(date +%s) - start))" -ge "$timeout_seconds" ]; then
      fail "Timed out waiting for $name at $url"
    fi

    sleep 2
  done

  log "$name is ready."
}

wait_for_port() {
  local host="$1"
  local port="$2"
  local name="$3"
  local timeout_seconds="${4:-180}"
  local process_pid="${5:-}"
  local start

  start="$(date +%s)"
  log "Waiting for $name on $host:$port..."

  while true; do
    if [ -n "$process_pid" ] && ! kill -0 "$process_pid" 2>/dev/null; then
      fail "$name exited before listening on $host:$port"
    fi

    if (echo >/dev/tcp/"$host"/"$port") >/dev/null 2>&1; then
      break
    fi

    if [ "$(($(date +%s) - start))" -ge "$timeout_seconds" ]; then
      fail "Timed out waiting for $name on $host:$port"
    fi

    sleep 2
  done

  log "$name is ready."
}

wait_for_admission() {
  local url="$1"
  local name="$2"
  local timeout_seconds="${3:-180}"
  local process_pid="${4:-}"
  local start
  local response

  start="$(date +%s)"
  log "Waiting for $name to accept new games at $url..."

  while true; do
    if [ -n "$process_pid" ] && ! kill -0 "$process_pid" 2>/dev/null; then
      fail "$name exited before admission became available at $url"
    fi

    if response="$(curl -fsS "$url" 2>/dev/null)" && \
      node -e '
        const status = JSON.parse(process.argv[1]);
        process.exit(
          status.admission === "accepting" &&
            status.available === true &&
            status.acceptingNewGames === true
            ? 0
            : 1
        );
      ' "$response" >/dev/null 2>&1; then
      break
    fi

    if [ "$(($(date +%s) - start))" -ge "$timeout_seconds" ]; then
      fail "Timed out waiting for $name to accept new games at $url"
    fi

    sleep 2
  done

  log "$name is accepting new games."
}

require_port_available() {
  local host="$1"
  local port="$2"
  local name="$3"

  if (echo >/dev/tcp/"$host"/"$port") >/dev/null 2>&1; then
    fail "$name cannot start because $host:$port is already in use"
  fi
}

require_not_root
require_command yarn
require_command node
require_command docker
require_command curl
require_command install
require_command pgrep

if use_sudo_docker; then
  require_command sudo
  log "Using sudo for Docker commands only."
  authenticate_sudo_docker
  trap cleanup EXIT INT TERM
fi

require_project "trucoshi-client" "$TRUCOSHI_CLIENT_DIR"
require_project "trucoshi" "$ROOT_DIR"

ensure_development_env

CLIENT_OPS_TOKEN="$(read_dotenv_value "$ROOT_DIR/.env" APP_OPS_TOKEN)"
CLIENT_OPS_STATUS_TOKEN="$(read_dotenv_value "$ROOT_DIR/.env" APP_OPS_STATUS_TOKEN)"
CLIENT_BETS_ENABLED="$(read_dotenv_value "$ROOT_DIR/.env" APP_BETS_ENABLED)"
CLIENT_COOKIE_PREFIX="$(read_dotenv_value "$ROOT_DIR/.env" APP_LIGHTNING_ACCOUNTS_COOKIE_PREFIX)"
require_bearer_token APP_OPS_TOKEN "$CLIENT_OPS_TOKEN"
require_bearer_token APP_OPS_STATUS_TOKEN "$CLIENT_OPS_STATUS_TOKEN"
[ "$CLIENT_OPS_TOKEN" != "$CLIENT_OPS_STATUS_TOKEN" ] || \
  fail "APP_OPS_TOKEN and APP_OPS_STATUS_TOKEN in $ROOT_DIR/.env must be different"
case "$CLIENT_BETS_ENABLED" in
  0|1) ;;
  *) fail "APP_BETS_ENABLED in $ROOT_DIR/.env must be 0 or 1" ;;
esac
unset CLIENT_OPS_TOKEN

export NODE_ENV

ensure_writable_path "trucoshi build output" "$ROOT_DIR/build"
ensure_writable_path "trucoshi dist output" "$ROOT_DIR/dist"

log "Preparing local linked packages..."
run_in "$ROOT_DIR" yarn build:dist
run_in "$ROOT_DIR" yarn link --link-folder "$DEV_ALL_LINK_DIR"

run_in "$TRUCOSHI_CLIENT_DIR" yarn link --link-folder "$DEV_ALL_LINK_DIR" trucoshi

trap cleanup EXIT INT TERM

start_process \
  "trucoshi type watcher" \
  "$ROOT_DIR" \
  yarn nodemon \
  --watch src \
  --watch prisma/schema.prisma \
  --watch tsconfig.base.json \
  --watch tsconfig.dist.json \
  --ext ts,json,prisma \
  --exec "yarn build:dist"

stop_trucoshi_stacks
ensure_lightning_accounts_network
require_port_available "localhost" "2999" "lightning-accounts"
require_port_available "localhost" "2992" "trucoshi"
require_port_available "localhost" "2991" "trucoshi-client"

start_docker_compose_process \
  "Trucoshi and Lightning Accounts Docker" \
  "$ROOT_DIR" \
  development \
  -f docker-compose.yml \
  -f docker-compose.dev-all-lightning-accounts.yml \
  up --build --abort-on-container-failure

COMBINED_COMPOSE_PID="${PIDS[${#PIDS[@]} - 1]}"
wait_for_url "http://localhost:2999/health/ready" "lightning-accounts" 600 "$COMBINED_COMPOSE_PID"
wait_for_url "http://localhost:2992/health/ready" "trucoshi" 300 "$COMBINED_COMPOSE_PID"

start_trucoshi_client \
  "$CLIENT_OPS_STATUS_TOKEN" \
  "$CLIENT_BETS_ENABLED" \
  "$CLIENT_COOKIE_PREFIX"
unset CLIENT_OPS_STATUS_TOKEN CLIENT_BETS_ENABLED CLIENT_COOKIE_PREFIX

TRUCOSHI_CLIENT_PID="${PIDS[${#PIDS[@]} - 1]}"
wait_for_port "localhost" "2991" "trucoshi-client" 180 "$TRUCOSHI_CLIENT_PID"
wait_for_admission \
  "http://localhost:2991/admission.json" \
  "trucoshi-client" \
  180 \
  "$TRUCOSHI_CLIENT_PID"

log "All services are running."
log "lightning-accounts: http://localhost:2999/v1/docs"
log "trucoshi: http://localhost:2992"
log "trucoshi-client: http://localhost:2991"

set +e
wait -n "${PIDS[@]}"
exit_code=$?
set -e

log "A dev process exited; shutting down..."
exit "$exit_code"
