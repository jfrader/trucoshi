#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIGHTNING_ACCOUNTS_DIR="$(cd "$ROOT_DIR/../lightning-accounts" 2>/dev/null && pwd || true)"
TRUCOSHI_CLIENT_DIR="$(cd "$ROOT_DIR/../trucoshi-client" 2>/dev/null && pwd || true)"
NODE_ENV="${NODE_ENV:-development}"
DEV_ALL_DOCKER_SUDO="${DEV_ALL_DOCKER_SUDO:-0}"
DEV_ALL_YARN_LINK_DIR="${DEV_ALL_YARN_LINK_DIR:-$ROOT_DIR/.dev-yarn-links}"

PIDS=()
PID_NAMES=()
CLEANING_UP=0
SUDO_KEEPALIVE_PID=""
HAVE_SETSID=0

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

has_command() {
  command -v "$1" >/dev/null 2>&1
}

require_not_root() {
  if [ "${EUID:-$(id -u)}" -eq 0 ]; then
    fail "Do not run this script with sudo. Use: yarn dev:all:sudo-docker. That mode only uses sudo for Docker commands."
  fi
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
    (cd "$dir" && NODE_ENV="$node_env" sudo -n --preserve-env=NODE_ENV docker compose "$@")
  else
    (cd "$dir" && env NODE_ENV="$node_env" docker compose "$@")
  fi
}

start_process() {
  local name="$1"
  local dir="$2"
  shift 2

  log "Starting $name..."
  if [ "$HAVE_SETSID" -eq 1 ]; then
    setsid bash -c 'dir="$1"; shift; cd "$dir" && exec "$@"' bash "$dir" "$@" &
  else
    (cd "$dir" && "$@") &
  fi
  PIDS+=("$!")
  PID_NAMES+=("$name")
}

start_docker_compose_process() {
  local name="$1"
  local dir="$2"
  local node_env="$3"
  shift 3

  log "Starting $name..."
  if use_sudo_docker; then
    (cd "$dir" && NODE_ENV="$node_env" sudo -n --preserve-env=NODE_ENV docker compose "$@") &
  else
    if [ "$HAVE_SETSID" -eq 1 ]; then
      setsid bash -c 'dir="$1"; node_env="$2"; shift 2; cd "$dir" && exec env NODE_ENV="$node_env" docker compose "$@"' bash "$dir" "$node_env" "$@" &
    else
      (cd "$dir" && env NODE_ENV="$node_env" docker compose "$@") &
    fi
  fi
  PIDS+=("$!")
  PID_NAMES+=("$name")
}

authenticate_sudo_docker() {
  if ! use_sudo_docker; then
    return
  fi

  log "Authenticating sudo for Docker commands..."
  if [ ! -r /dev/tty ]; then
    fail "Cannot authenticate sudo because /dev/tty is not readable"
  fi

  sudo docker version >/dev/null < /dev/tty || fail "Could not authenticate sudo for Docker commands"

  (
    while true; do
      sudo -n docker version >/dev/null 2>&1 || exit
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

stop_process() {
  local pid="$1"
  local name="$2"

  if ! kill -0 "$pid" 2>/dev/null; then
    return
  fi

  log "Stopping $name..."
  if [ "$HAVE_SETSID" -eq 1 ]; then
    kill -TERM "-$pid" 2>/dev/null || kill_tree "$pid"
  else
    kill_tree "$pid"
  fi
}

cleanup() {
  local exit_code=$?
  local i

  if [ "$CLEANING_UP" -eq 1 ]; then
    exit "$exit_code"
  fi

  CLEANING_UP=1
  trap - EXIT INT TERM
  set +e

  log "Stopping dev processes..."
  if [ "${#PIDS[@]}" -gt 0 ]; then
    for ((i = ${#PIDS[@]} - 1; i >= 0; i--)); do
      stop_process "${PIDS[$i]}" "${PID_NAMES[$i]}"
    done

    wait "${PIDS[@]}" 2>/dev/null
  fi

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

ensure_writable_tree() {
  local label="$1"
  local path="$2"
  local blocked_path

  ensure_writable_path "$label" "$path"

  if [ ! -e "$path" ]; then
    return
  fi

  blocked_path="$(find "$path" ! -writable -print -quit 2>/dev/null || true)"
  if [ -n "$blocked_path" ]; then
    ls -ld "$blocked_path" >&2 || true
    fail "$label contains a non-writable path. Fix ownership once with: sudo chown -R $(id -u):$(id -g) \"$path\""
  fi
}

ensure_project_writable_paths() {
  local name="$1"
  local dir="$2"

  ensure_writable_path "$name node_modules" "$dir/node_modules"
  ensure_writable_path "$name package install metadata" "$dir/package.json"

  if [ -e "$dir/yarn.lock" ]; then
    ensure_writable_path "$name lockfile" "$dir/yarn.lock"
  fi
}

ensure_lightning_accounts_prisma_install() {
  local check_output

  if [ ! -d "$LIGHTNING_ACCOUNTS_DIR/node_modules" ]; then
    fail "lightning-accounts dependencies are not installed. Run in $LIGHTNING_ACCOUNTS_DIR: yarn install"
  fi

  ensure_writable_tree \
    "lightning-accounts generated Prisma client" \
    "$LIGHTNING_ACCOUNTS_DIR/node_modules/.prisma/client"
  ensure_writable_path \
    "lightning-accounts Prisma JSON schema" \
    "$LIGHTNING_ACCOUNTS_DIR/prisma/json-schema.json"

  if ! check_output="$(
    cd "$LIGHTNING_ACCOUNTS_DIR" && node -e '
      const clientVersion = require("./node_modules/@prisma/client/package.json").version;
      const prismaVersion = require("./node_modules/prisma/package.json").version;
      if (clientVersion !== prismaVersion) {
        console.error(`@prisma/client ${clientVersion} does not match prisma ${prismaVersion}`);
        process.exit(1);
      }
      console.log(`@prisma/client and prisma ${clientVersion}`);
    ' 2>&1
  )"; then
    fail "lightning-accounts has a broken Prisma install: $check_output. Fix once with: cd \"$LIGHTNING_ACCOUNTS_DIR\" && sudo chown -R $(id -u):$(id -g) node_modules dist prisma/json-schema.json && yarn install --force"
  fi

  log "Verified lightning-accounts Prisma install: $check_output"
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

require_not_root
require_command yarn
require_command node
require_command docker
require_command curl
require_command pgrep

if has_command setsid; then
  HAVE_SETSID=1
fi

if use_sudo_docker; then
  require_command sudo
  log "Using sudo for Docker commands only."
fi

require_project "lightning-accounts" "$LIGHTNING_ACCOUNTS_DIR"
require_project "trucoshi-client" "$TRUCOSHI_CLIENT_DIR"
require_project "trucoshi" "$ROOT_DIR"

export NODE_ENV

ensure_writable_tree "lightning-accounts dist output" "$LIGHTNING_ACCOUNTS_DIR/dist"
ensure_writable_tree "lightning-accounts build output" "$LIGHTNING_ACCOUNTS_DIR/build"
ensure_writable_tree "trucoshi build output" "$ROOT_DIR/build"
ensure_writable_tree "trucoshi dist output" "$ROOT_DIR/dist"
ensure_writable_tree "trucoshi-client Vite cache" "$TRUCOSHI_CLIENT_DIR/node_modules/.vite"
ensure_project_writable_paths "lightning-accounts" "$LIGHTNING_ACCOUNTS_DIR"
ensure_project_writable_paths "trucoshi" "$ROOT_DIR"
ensure_project_writable_paths "trucoshi-client" "$TRUCOSHI_CLIENT_DIR"
ensure_writable_path "local Yarn link folder" "$DEV_ALL_YARN_LINK_DIR"
ensure_lightning_accounts_prisma_install

log "Preparing local linked packages..."
run_in "$LIGHTNING_ACCOUNTS_DIR" yarn swagger:generate
run_in "$LIGHTNING_ACCOUNTS_DIR" yarn link --link-folder "$DEV_ALL_YARN_LINK_DIR"

run_in "$ROOT_DIR" yarn link --link-folder "$DEV_ALL_YARN_LINK_DIR" lightning-accounts
run_in "$ROOT_DIR" yarn build:dist
run_in "$ROOT_DIR" yarn link --link-folder "$DEV_ALL_YARN_LINK_DIR"

run_in "$TRUCOSHI_CLIENT_DIR" yarn link --link-folder "$DEV_ALL_YARN_LINK_DIR" lightning-accounts
run_in "$TRUCOSHI_CLIENT_DIR" yarn link --link-folder "$DEV_ALL_YARN_LINK_DIR" trucoshi

authenticate_sudo_docker
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
  --exec "yarn swagger:generate"

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
