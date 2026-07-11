# Trucoshi

Bitcoin Lightning "Truco" Server

### English

Try current demo at [Trucoshi](https://trucoshi.com)

### Spanish

Proba la demo actual en [Trucoshi](https://trucoshi.com)

# Client

[Trucoshi React Client](https://github.com/jfrader/trucoshi-client)

# Accounts

[Lightning Accounts](https://github.com/jfrader/lightning-accounts)

### Installation

`yarn`

### Build

`yarn build`

### Full local dev stack

Run the three-repo local stack from this repo with:

`yarn dev:all`

If your user cannot run Docker directly, use `yarn dev:all:sudo-docker`. Do not prefix either command with `sudo`; that mode only elevates Docker commands, so Yarn, Vite, generated Prisma files, and local links remain owned by your user.

The launcher keeps the local stack in development mode: Lightning Accounts, Trucoshi, and the Vite client. Its home screen continuously refreshes the stack status and service URLs. Use the numbered shortcuts or ↑/↓ to move, Enter or → to select, and ← or Esc to go back. It can also build and host a client snapshot at `http://10.10.1.106:2993`. The snapshot is off by default, so it never slows Vite's hot-reload loop. Set `DEV_ALL_PUBLIC_HOST`, `DEV_ALL_CLIENT_HOST_PORT`, or `DEV_ALL_LOG_DIR` if you need different defaults.

# Test

`yarn test`

### Docker e2e

Trucoshi e2e tests depend on a running Lightning Accounts e2e server. Start that first in one
terminal, then run the Trucoshi e2e suite in another:

```bash
cd /home/fran/Workspace/trucoshi/lightning-accounts
NODE_ENV=test ./init-e2e.sh
```

```bash
cd /home/fran/Workspace/trucoshi/trucoshi
NODE_ENV=test ./init-e2e.sh
```

Use `../lightning-accounts/init-test.sh` when you want to run the Lightning Accounts Jest/e2e
suite itself. Use `../lightning-accounts/init-e2e.sh` when Trucoshi needs the persistent API,
regtest bitcoind, and LND containers.

### Docker migrations

Production and staging containers do not run database seeds. Run migrations explicitly before
starting a newly built app image.

Staging:

```bash
docker compose -f docker-compose.staging.yml --env-file .env build server
docker compose -f docker-compose.staging.yml --env-file .env up -d postgres redis
yarn docker:staging:migrate
docker compose -f docker-compose.staging.yml --env-file .env up -d --build server
```

Production uses the same sequence with `docker-compose.prod.yml` and `yarn docker:prod:migrate`.

### Admin users

User roles live in Lightning Accounts. To promote an existing user by email:

```bash
cd /home/fran/Workspace/trucoshi/lightning-accounts
yarn docker:staging:make-admin --email you@example.com
yarn docker:prod:make-admin --email you@example.com
```

The command only updates an existing non-`APPLICATION` user to `ADMIN`; it does not create users or
run seeds.

### Play

`yarn cli:play`

### Autoplay

`yarn cli:autoplay`

# Todo

    [x] Logica de turnos, rondas y battalla de cartas
    [x] Irse al mazo
    [x] Cantar truco
    [x] Cantar envido
    [x] Socket server
    [x] Unit tests
    [x] Bitcoin Lightning integration
    [x] Historial de partidas
    [x] Cantar flor
    [ ] Torneos

# Donations

Donate Bitcoin at [jfrader.com/tips](https://jfrader.com/tips)

# License

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
