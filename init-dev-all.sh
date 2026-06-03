#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIGHTNING_ACCOUNTS_DIR="$(cd "$ROOT_DIR/../lightning-accounts" 2>/dev/null && pwd || true)"
TRUCOSHI_CLIENT_DIR="$(cd "$ROOT_DIR/../trucoshi-client" 2>/dev/null && pwd || true)"
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

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
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

start_process() {
  local name="$1"
  local dir="$2"
  shift 2

  log "Starting $name..."
  (cd "$dir" && "$@") &
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
  for pid in "${PIDS[@]}"; do
    kill_tree "$pid"
  done

  wait "${PIDS[@]}" 2>/dev/null

  log "Stopping trucoshi Docker dev stack..."
  docker_compose "$ROOT_DIR" development -f docker-compose.yml -f docker-compose.local-links.yml down

  if [ -n "$LIGHTNING_ACCOUNTS_DIR" ]; then
    log "Stopping lightning-accounts Docker dev stack..."
    docker_compose "$LIGHTNING_ACCOUNTS_DIR" development -f docker-compose.yml down
  fi

  if [ -n "$SUDO_KEEPALIVE_PID" ]; then
    kill "$SUDO_KEEPALIVE_PID" 2>/dev/null || true
    wait "$SUDO_KEEPALIVE_PID" 2>/dev/null || true
  fi

  exit "$exit_code"
}

stop_trucoshi_stacks() {
  docker_compose "$ROOT_DIR" test -f docker-compose.yml -f docker-compose.e2e.yml down
  docker_compose "$ROOT_DIR" development -f docker-compose.yml -f docker-compose.e2e.yml down
  docker_compose \
    "$ROOT_DIR" \
    production \
    -f docker-compose.yml \
    -f docker-compose.prod.yml \
    -f docker-compose.staging.yml \
    down
}

stop_lightning_accounts_stacks() {
  docker_compose \
    "$LIGHTNING_ACCOUNTS_DIR" \
    test \
    -f docker-compose.yml \
    -f docker-compose.e2e.yml \
    -f docker-compose.test.yml \
    down
  docker_compose \
    "$LIGHTNING_ACCOUNTS_DIR" \
    development \
    -f docker-compose.yml \
    -f docker-compose.e2e.yml \
    -f docker-compose.test.yml \
    down
  docker_compose \
    "$LIGHTNING_ACCOUNTS_DIR" \
    production \
    -f docker-compose.yml \
    -f docker-compose.prod.yml \
    -f docker-compose.staging.yml \
    down
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

wait_for_url() {
  local url="$1"
  local name="$2"
  local timeout_seconds="${3:-180}"
  local start

  start="$(date +%s)"
  log "Waiting for $name at $url..."

  until curl -fsS "$url" >/dev/null 2>&1; do
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
  local start

  start="$(date +%s)"
  log "Waiting for $name on $host:$port..."

  until (echo >/dev/tcp/"$host"/"$port") >/dev/null 2>&1; do
    if [ "$(($(date +%s) - start))" -ge "$timeout_seconds" ]; then
      fail "Timed out waiting for $name on $host:$port"
    fi

    sleep 2
  done

  log "$name is ready."
}

require_command yarn
require_command docker
require_command curl
require_command pgrep

if use_sudo_docker; then
  require_command sudo
  log "Using sudo for Docker commands only."
  authenticate_sudo_docker
  trap cleanup EXIT INT TERM
fi

require_project "lightning-accounts" "$LIGHTNING_ACCOUNTS_DIR"
require_project "trucoshi-client" "$TRUCOSHI_CLIENT_DIR"
require_project "trucoshi" "$ROOT_DIR"

export NODE_ENV

ensure_writable_path "lightning-accounts build output" "$LIGHTNING_ACCOUNTS_DIR/build"
ensure_writable_path "lightning-accounts dist output" "$LIGHTNING_ACCOUNTS_DIR/dist"
ensure_writable_path "trucoshi build output" "$ROOT_DIR/build"
ensure_writable_path "trucoshi dist output" "$ROOT_DIR/dist"

log "Preparing local linked packages..."
run_in "$LIGHTNING_ACCOUNTS_DIR" yarn build
run_in "$LIGHTNING_ACCOUNTS_DIR" yarn link

run_in "$ROOT_DIR" yarn link lightning-accounts
run_in "$ROOT_DIR" yarn build:dist
run_in "$ROOT_DIR" yarn link

run_in "$TRUCOSHI_CLIENT_DIR" yarn link lightning-accounts
run_in "$TRUCOSHI_CLIENT_DIR" yarn link trucoshi

trap cleanup EXIT INT TERM

start_process \
  "lightning-accounts type watcher" \
  "$LIGHTNING_ACCOUNTS_DIR" \
  yarn nodemon \
  --watch src \
  --watch prisma/schema.prisma \
  --watch scripts \
  --watch tsconfig.json \
  --watch tsconfig.build.json \
  --watch tsconfig.dist.json \
  --ext ts,json,prisma,yml,yaml \
  --exec "yarn build"

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

stop_lightning_accounts_stacks

docker_compose "$LIGHTNING_ACCOUNTS_DIR" development up backend1 alice carol bob -d --build

start_docker_compose_process \
  "lightning-accounts Docker" \
  "$LIGHTNING_ACCOUNTS_DIR" \
  development \
  up postgres_ln server --build --abort-on-container-exit

wait_for_url "http://localhost:2999/v1/docs" "lightning-accounts"

stop_trucoshi_stacks

start_docker_compose_process \
  "trucoshi Docker" \
  "$ROOT_DIR" \
  development \
  -f docker-compose.yml \
  -f docker-compose.local-links.yml \
  up --build --abort-on-container-exit

wait_for_port "localhost" "2992" "trucoshi"

start_process \
  "trucoshi-client Vite" \
  "$TRUCOSHI_CLIENT_DIR" \
  yarn start --host --force

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
