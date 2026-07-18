#!/bin/bash

# Stop and restart containers
echo "Restarting Docker services..."

./init-stop-all.sh

docker compose -f docker-compose.yml up --build --abort-on-container-exit
