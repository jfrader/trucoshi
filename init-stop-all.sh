NODE_ENV=test docker-compose -f docker-compose.yml -f docker-compose.e2e.yml down
NODE_ENV=development docker-compose -f docker-compose.yml -f docker-compose.e2e.yml down
NODE_ENV=production docker-compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.staging.yml down
