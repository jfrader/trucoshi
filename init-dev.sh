#!/bin/bash

set -Eeuo pipefail

NODE_ENV="${NODE_ENV:-development}"
COMPOSE_FILES=(-f docker-compose.yml)
COMPOSE_PID=""
CLEANING_UP=0

cleanup() {
  local exit_code=$?

  if [ "$CLEANING_UP" -eq 1 ]; then
    exit "$exit_code"
  fi

  CLEANING_UP=1
  trap - EXIT INT TERM
  set +e

  if [ -n "$COMPOSE_PID" ]; then
    kill "$COMPOSE_PID" 2>/dev/null || true
    wait "$COMPOSE_PID" 2>/dev/null || true
  fi

  echo "Stopping Docker services..."
  NODE_ENV="$NODE_ENV" docker compose "${COMPOSE_FILES[@]}" down

  exit "$exit_code"
}

trap cleanup EXIT INT TERM

# Stop and restart containers
echo "Restarting Docker services..."

./init-stop-all.sh

NODE_ENV="$NODE_ENV" docker compose "${COMPOSE_FILES[@]}" up --build --abort-on-container-exit &
COMPOSE_PID="$!"
wait "$COMPOSE_PID"
