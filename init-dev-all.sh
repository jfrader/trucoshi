#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIGHTNING_ACCOUNTS_DIR="$(cd "$ROOT_DIR/../lightning-accounts" 2>/dev/null && pwd || true)"
TRUCOSHI_CLIENT_DIR="$(cd "$ROOT_DIR/../trucoshi-client" 2>/dev/null && pwd || true)"
NODE_ENV="${NODE_ENV:-development}"
DEV_ALL_DOCKER_SUDO="${DEV_ALL_DOCKER_SUDO:-0}"
DEV_ALL_YARN_LINK_DIR="${DEV_ALL_YARN_LINK_DIR:-$ROOT_DIR/.dev-yarn-links}"
DEV_ALL_CLIENT_HOST_PORT="${DEV_ALL_CLIENT_HOST_PORT:-2993}"
DEV_ALL_PUBLIC_HOST="${DEV_ALL_PUBLIC_HOST:-10.10.1.106}"
DEV_ALL_LOG_DIR="${DEV_ALL_LOG_DIR:-$ROOT_DIR/.dev-all-logs}"

PIDS=()
PID_NAMES=()
PID_LOG_FILES=()
CLEANING_UP=0
SUDO_KEEPALIVE_PID=""
HAVE_SETSID=0

if [ -t 1 ]; then
  BOLD=$'\033[1m'
  CYAN=$'\033[36m'
  GREEN=$'\033[32m'
  YELLOW=$'\033[33m'
  DIM=$'\033[2m'
  RESET=$'\033[0m'
else
  BOLD=""
  CYAN=""
  GREEN=""
  YELLOW=""
  DIM=""
  RESET=""
fi

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

docker_compose_quiet() {
  local dir="$1"
  local node_env="$2"
  shift 2

  if use_sudo_docker; then
    (cd "$dir" && NODE_ENV="$node_env" sudo -n --preserve-env=NODE_ENV docker compose "$@")
  else
    (cd "$dir" && env NODE_ENV="$node_env" docker compose "$@")
  fi
}

start_process() {
  local name="$1"
  local dir="$2"
  local log_file
  shift 2

  log_file="$DEV_ALL_LOG_DIR/${#PIDS[@]}-${name// /-}.log"
  log "Starting $name (logs: $log_file)..."
  if [ "$HAVE_SETSID" -eq 1 ]; then
    setsid bash -c 'dir="$1"; shift; cd "$dir" && exec "$@"' bash "$dir" "$@" >"$log_file" 2>&1 &
  else
    (cd "$dir" && "$@") >"$log_file" 2>&1 &
  fi
  PIDS+=("$!")
  PID_NAMES+=("$name")
  PID_LOG_FILES+=("$log_file")
}

start_docker_compose_process() {
  local name="$1"
  local dir="$2"
  local node_env="$3"
  local log_file
  shift 3

  log_file="$DEV_ALL_LOG_DIR/${#PIDS[@]}-${name// /-}.log"
  log "Starting $name (logs: $log_file)..."
  if use_sudo_docker; then
    # sudo credentials are tied to the controlling terminal on this setup.
    # Do not detach this branch with setsid or sudo -n will ask for a password.
    (cd "$dir" && NODE_ENV="$node_env" sudo -n --preserve-env=NODE_ENV docker compose "$@") >"$log_file" 2>&1 &
  else
    if [ "$HAVE_SETSID" -eq 1 ]; then
      setsid bash -c 'dir="$1"; node_env="$2"; shift 2; cd "$dir" && exec env NODE_ENV="$node_env" docker compose "$@"' bash "$dir" "$node_env" "$@" >"$log_file" 2>&1 &
    else
      (cd "$dir" && env NODE_ENV="$node_env" docker compose "$@") >"$log_file" 2>&1 &
    fi
  fi
  PIDS+=("$!")
  PID_NAMES+=("$name")
  PID_LOG_FILES+=("$log_file")
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

is_process_running() {
  local name="$1"
  local i

  for ((i = ${#PIDS[@]} - 1; i >= 0; i--)); do
    if [ "${PID_NAMES[$i]}" = "$name" ] && kill -0 "${PIDS[$i]}" 2>/dev/null; then
      return 0
    fi
  done

  return 1
}

stop_named_processes() {
  local name="$1"
  local i

  for ((i = ${#PIDS[@]} - 1; i >= 0; i--)); do
    if [ "${PID_NAMES[$i]}" = "$name" ]; then
      stop_process "${PIDS[$i]}" "$name"
    fi
  done
}

latest_log_file() {
  local name="$1"
  local i

  for ((i = ${#PIDS[@]} - 1; i >= 0; i--)); do
    if [ "${PID_NAMES[$i]}" = "$name" ]; then
      printf '%s\n' "${PID_LOG_FILES[$i]}"
      return 0
    fi
  done

  return 1
}

run_menu_command() {
  local exit_code

  # A log view should return to the launcher on Ctrl-C, not stop the stack.
  trap '' INT
  set +e
  (
    trap - INT
    "$@"
  )
  exit_code=$?
  set -e
  trap cleanup INT

  return "$exit_code"
}

follow_process_logs() {
  local name="$1"
  local log_file

  if ! log_file="$(latest_log_file "$name")"; then
    log "No log file exists for $name yet."
    return
  fi

  printf '\n%sWatching %s logs — press Ctrl-C to return to the menu.%s\n\n' "$CYAN" "$name" "$RESET"
  run_menu_command tail -n 120 -F "$log_file" || true
}

follow_docker_logs() {
  local name="$1"
  local dir="$2"
  local exit_code

  printf '\n%sWatching %s Docker logs — press Ctrl-C to return to the menu.%s\n\n' "$CYAN" "$name" "$RESET"
  trap '' INT
  set +e
  (
    trap - INT
    docker_compose "$dir" development logs --tail 120 --follow
  )
  exit_code=$?
  set -e
  trap cleanup INT

  if [ "$exit_code" -ne 0 ] && [ "$exit_code" -ne 130 ]; then
    log "Stopped watching $name Docker logs (exit $exit_code)."
  fi
}

start_lightning_accounts_docker() {
  docker_compose "$LIGHTNING_ACCOUNTS_DIR" development up backend1 alice carol bob -d --build

  start_docker_compose_process \
    "lightning-accounts Docker" \
    "$LIGHTNING_ACCOUNTS_DIR" \
    development \
    up postgres_ln server --build --abort-on-container-exit
}

start_trucoshi_docker() {
  start_docker_compose_process \
    "trucoshi Docker" \
    "$ROOT_DIR" \
    development \
    -f docker-compose.yml \
    -f docker-compose.local-links.yml \
    up --build --abort-on-container-exit
}

start_client_vite() {
  wait_for_port_to_be_available \
    "localhost" \
    "2991" \
    "trucoshi-client Vite"

  start_process \
    "trucoshi-client Vite" \
    "$TRUCOSHI_CLIENT_DIR" \
    yarn dev --host --port=2991 --strictPort
}

start_client_host() {
  if is_process_running "trucoshi-client host"; then
    log "trucoshi-client host is already running at http://$DEV_ALL_PUBLIC_HOST:$DEV_ALL_CLIENT_HOST_PORT"
    return
  fi

  log "Building trucoshi-client for a local host snapshot..."
  run_in "$TRUCOSHI_CLIENT_DIR" yarn build

  start_process \
    "trucoshi-client host" \
    "$TRUCOSHI_CLIENT_DIR" \
    env \
    PORT="$DEV_ALL_CLIENT_HOST_PORT" \
    HOST=0.0.0.0 \
    yarn start

  wait_for_managed_process_port \
    "trucoshi-client host" \
    "localhost" \
    "$DEV_ALL_CLIENT_HOST_PORT"
  log "trucoshi-client host: http://$DEV_ALL_PUBLIC_HOST:$DEV_ALL_CLIENT_HOST_PORT"
}

restart_lightning_accounts() {
  log "Restarting lightning-accounts Docker stack..."
  stop_named_processes "lightning-accounts Docker"
  docker_compose "$LIGHTNING_ACCOUNTS_DIR" development down
  start_lightning_accounts_docker
  wait_for_url "http://localhost:2999/v1/docs" "lightning-accounts"
}

restart_trucoshi() {
  log "Restarting trucoshi Docker stack..."
  stop_named_processes "trucoshi Docker"
  docker_compose "$ROOT_DIR" development -f docker-compose.yml -f docker-compose.local-links.yml down
  wait_for_port_to_be_available "localhost" "2992" "trucoshi"
  start_trucoshi_docker
  wait_for_managed_process_url \
    "trucoshi Docker" \
    "http://localhost:2992/socket.io/?EIO=4&transport=polling" \
    "trucoshi"
}

restart_client_vite() {
  log "Restarting trucoshi-client Vite..."
  stop_named_processes "trucoshi-client Vite"
  start_client_vite
  wait_for_managed_process_port "trucoshi-client Vite" "localhost" "2991"
}

render_stack_status() {
  local i
  local j
  local has_newer_entry
  local state

  printf '%sStack status%s\n' "$BOLD" "$RESET"
  printf '  Lightning Accounts  http://localhost:2999/v1/docs  (port 2999)\n'
  printf '  Trucoshi            http://localhost:2992          (port 2992)\n'
  printf '  Client (Vite)       http://%s:2991        (port 2991)\n' "$DEV_ALL_PUBLIC_HOST"
  printf '  Client snapshot     http://%s:%s        (port %s)\n' "$DEV_ALL_PUBLIC_HOST" "$DEV_ALL_CLIENT_HOST_PORT" "$DEV_ALL_CLIENT_HOST_PORT"

  printf '\n%sManaged processes%s\n' "$BOLD" "$RESET"
  printf '%-34s %s\n' "Service" "Status"
  for ((i = 0; i < ${#PIDS[@]}; i++)); do
    has_newer_entry=0
    for ((j = i + 1; j < ${#PIDS[@]}; j++)); do
      if [ "${PID_NAMES[$i]}" = "${PID_NAMES[$j]}" ]; then
        has_newer_entry=1
        break
      fi
    done
    if [ "$has_newer_entry" -eq 1 ]; then
      continue
    fi

    if kill -0 "${PIDS[$i]}" 2>/dev/null; then
      state="${GREEN}running${RESET}"
    else
      state="${YELLOW}stopped${RESET}"
    fi
    printf '%-34s %b\n' "${PID_NAMES[$i]}" "$state"
  done

  printf '\n%sTrucoshi Docker%s\n' "$BOLD" "$RESET"
  docker_compose_quiet "$ROOT_DIR" development -f docker-compose.yml -f docker-compose.local-links.yml ps 2>&1 || true
  printf '\n%sLightning Accounts Docker%s\n' "$BOLD" "$RESET"
  docker_compose_quiet "$LIGHTNING_ACCOUNTS_DIR" development ps 2>&1 || true
}

tui_clear() {
  printf '\033[2J\033[H'
}

tui_read_key() {
  local key
  local escape_sequence
  local timeout_seconds="${1:-}"

  if [ -n "$timeout_seconds" ]; then
    IFS= read -rsn1 -t "$timeout_seconds" key || {
      TUI_KEY="refresh"
      return
    }
  else
    IFS= read -rsn1 key || {
      TUI_KEY="exit"
      return
    }
  fi

  case "$key" in
    '') TUI_KEY="enter" ;;
    $'\r'|$'\n') TUI_KEY="enter" ;;
    $'\e')
      IFS= read -rsn2 -t 0.05 escape_sequence || true
      case "$escape_sequence" in
        '[A'|'OA') TUI_KEY="up" ;;
        '[B'|'OB') TUI_KEY="down" ;;
        '[C'|'OC') TUI_KEY="right" ;;
        '[D'|'OD') TUI_KEY="back" ;;
        *) TUI_KEY="back" ;;
      esac
      ;;
    k|K) TUI_KEY="up" ;;
    j|J) TUI_KEY="down" ;;
    q|Q) TUI_KEY="exit" ;;
    0|1|2|3|4|5|6|7|8|9) TUI_KEY="number:$key" ;;
    *) TUI_KEY="other" ;;
  esac
}

tui_draw_menu() {
  local title="$1"
  local selected="$2"
  local details="$3"
  shift 3
  local items=("$@")
  local i
  local prefix

  tui_clear
  printf '%s%s╭──────────────────────────────────────╮%s\n' "$CYAN" "$BOLD" "$RESET"
  printf '%s%s│          TRUCOSHI DEV CONTROL          │%s\n' "$CYAN" "$BOLD" "$RESET"
  printf '%s%s╰──────────────────────────────────────╯%s\n\n' "$CYAN" "$BOLD" "$RESET"
  printf '%s%s%s\n' "$BOLD" "$title" "$RESET"

  if [ -n "$details" ]; then
    printf '\n%s\n' "$details"
  fi

  printf '\n%sActions%s\n' "$BOLD" "$RESET"

  for ((i = 0; i < ${#items[@]}; i++)); do
    if [ "$i" -eq "$selected" ]; then
      prefix="${GREEN}${BOLD}›${RESET}"
      printf '  %s %s%s%s\n' "$prefix" "$BOLD" "${items[$i]}" "$RESET"
    else
      printf '    %s\n' "${items[$i]}"
    fi
  done

  printf '\n%s↑/↓%s Move   %sEnter/→%s Select   %s←/Esc%s Back   %s0–9%s Shortcut   %sq%s Exit\n' "$DIM" "$RESET" "$DIM" "$RESET" "$DIM" "$RESET" "$DIM" "$RESET" "$DIM" "$RESET"
}

tui_select_menu() {
  local title="$1"
  local selected="$2"
  local details="$3"
  local number
  shift 3
  local items=("$@")

  while true; do
    if [ "$details" = "__LIVE_STACK_STATUS__" ]; then
      tui_draw_menu "$title" "$selected" "$(render_stack_status)" "${items[@]}"
      tui_read_key 2
    else
      tui_draw_menu "$title" "$selected" "$details" "${items[@]}"
      tui_read_key
    fi

    case "$TUI_KEY" in
      refresh) ;;
      up)
        selected=$(( (selected - 1 + ${#items[@]}) % ${#items[@]} ))
        ;;
      down)
        selected=$(( (selected + 1) % ${#items[@]} ))
        ;;
      enter|right)
        TUI_SELECTED="$selected"
        TUI_ACTION="select"
        return
        ;;
      number:*)
        number="${TUI_KEY#number:}"
        if [ "$number" = "0" ]; then
          selected=$((${#items[@]} - 1))
        elif [ "$number" -le "${#items[@]}" ]; then
          selected=$((number - 1))
        else
          continue
        fi
        TUI_SELECTED="$selected"
        TUI_ACTION="select"
        return
        ;;
      back|exit)
        TUI_SELECTED="$selected"
        TUI_ACTION="$TUI_KEY"
        return
        ;;
    esac
  done
}

run_log_menu() {
  local selected=0
  local items=(
    "1) Trucoshi Docker"
    "2) Lightning Accounts Docker"
    "3) Trucoshi client (Vite)"
    "4) Trucoshi type watcher"
    "5) Lightning Accounts type watcher"
    "6) Trucoshi client host"
    "0) ← Back"
  )

  while true; do
    tui_select_menu "Live logs" "$selected" "" "${items[@]}"
    selected="$TUI_SELECTED"

    case "$TUI_ACTION:$selected" in
      select:0) follow_docker_logs "trucoshi" "$ROOT_DIR" ;;
      select:1) follow_docker_logs "lightning-accounts" "$LIGHTNING_ACCOUNTS_DIR" ;;
      select:2) follow_process_logs "trucoshi-client Vite" ;;
      select:3) follow_process_logs "trucoshi type watcher" ;;
      select:4) follow_process_logs "lightning-accounts type watcher" ;;
      select:5) follow_process_logs "trucoshi-client host" ;;
      select:6|back:*) return ;;
      exit:*) exit 0 ;;
    esac
  done
}

run_manage_menu() {
  local selected=0
  local items=(
    "1) Restart Lightning Accounts Docker (rebuild)"
    "2) Restart Trucoshi Docker (rebuild)"
    "3) Restart Trucoshi client Vite"
    "4) Stop the hosted client snapshot"
    "0) ← Back"
  )

  while true; do
    tui_select_menu "Manage services" "$selected" "" "${items[@]}"
    selected="$TUI_SELECTED"

    case "$TUI_ACTION:$selected" in
      select:0) restart_lightning_accounts ;;
      select:1) restart_trucoshi ;;
      select:2) restart_client_vite ;;
      select:3) stop_named_processes "trucoshi-client host" ;;
      select:4|back:*) return ;;
      exit:*) exit 0 ;;
    esac
  done
}

run_control_panel() {
  local selected=0
  local items=(
    "1) Live logs"
    "2) Manage / restart services"
    "3) Build + host a client snapshot (http://$DEV_ALL_PUBLIC_HOST:$DEV_ALL_CLIENT_HOST_PORT)"
    "0) Stop everything and exit"
  )

  if [ ! -t 0 ]; then
    log "No interactive terminal detected; keeping the dev stack alive until a process exits."
    set +e
    wait -n "${PIDS[@]}"
    exit_code=$?
    set -e
    log "A dev process exited; shutting down..."
    exit "$exit_code"
  fi

  while true; do
    tui_select_menu "Home" "$selected" "__LIVE_STACK_STATUS__" "${items[@]}"
    selected="$TUI_SELECTED"

    case "$TUI_ACTION:$selected" in
      select:0) run_log_menu ;;
      select:1) run_manage_menu ;;
      select:2) start_client_host ;;
      select:3|back:*|exit:*) exit 0 ;;
    esac
  done
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

wait_for_port_to_be_available() {
  local host="$1"
  local port="$2"
  local name="$3"
  local timeout_seconds="${4:-15}"
  local start

  start="$(date +%s)"
  log "Checking that $name can use $host:$port..."

  while (echo >/dev/tcp/"$host"/"$port") >/dev/null 2>&1; do
    if [ "$(($(date +%s) - start))" -ge "$timeout_seconds" ]; then
      fail "$name cannot start because $host:$port is already in use. Stop the process using that port, then run yarn dev:all again."
    fi

    sleep 1
  done
}

wait_for_managed_process_port() {
  local name="$1"
  local host="$2"
  local port="$3"
  local timeout_seconds="${4:-60}"
  local start
  local log_file

  start="$(date +%s)"
  log "Waiting for $name on $host:$port..."

  while true; do
    if ! is_process_running "$name"; then
      log_file="$(latest_log_file "$name" || true)"
      fail "$name exited before listening on $host:$port. Check ${log_file:-its log file}."
    fi

    if (echo >/dev/tcp/"$host"/"$port") >/dev/null 2>&1; then
      break
    fi

    if [ "$(($(date +%s) - start))" -ge "$timeout_seconds" ]; then
      log_file="$(latest_log_file "$name" || true)"
      fail "Timed out waiting for $name on $host:$port. Check ${log_file:-its log file}."
    fi

    sleep 1
  done

  log "$name is ready."
}

wait_for_managed_process_url() {
  local process_name="$1"
  local url="$2"
  local name="$3"
  local timeout_seconds="${4:-180}"
  local start
  local log_file

  start="$(date +%s)"
  log "Waiting for $name at $url..."

  while true; do
    if ! is_process_running "$process_name"; then
      log_file="$(latest_log_file "$process_name" || true)"
      fail "$process_name exited before $name became ready. Check ${log_file:-its log file}."
    fi

    if curl -fsS "$url" >/dev/null 2>&1; then
      break
    fi

    if [ "$(($(date +%s) - start))" -ge "$timeout_seconds" ]; then
      log_file="$(latest_log_file "$process_name" || true)"
      fail "Timed out waiting for $name at $url. Check ${log_file:-its log file}."
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
require_command tail

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
ensure_writable_path "dev log folder" "$DEV_ALL_LOG_DIR"
mkdir -p "$DEV_ALL_LOG_DIR"
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

start_lightning_accounts_docker

wait_for_url "http://localhost:2999/v1/docs" "lightning-accounts"

stop_trucoshi_stacks

wait_for_port_to_be_available "localhost" "2992" "trucoshi"
start_trucoshi_docker

wait_for_managed_process_url \
  "trucoshi Docker" \
  "http://localhost:2992/socket.io/?EIO=4&transport=polling" \
  "trucoshi"

start_client_vite
wait_for_managed_process_port "trucoshi-client Vite" "localhost" "2991"

log "All services are running."
log "lightning-accounts: http://localhost:2999/v1/docs"
log "trucoshi: http://localhost:2992"
log "trucoshi-client: http://$DEV_ALL_PUBLIC_HOST:2991"
log "Use the control panel to inspect logs, restart services, or host a client snapshot."

run_control_panel
