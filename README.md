# Trucoshi

Bitcoin Lightning server for the Argentinian card game Truco.

- [Play Trucoshi](https://trucoshi.com)
- [Web client](https://github.com/jfrader/trucoshi-client)
- [Lightning Accounts](https://github.com/jfrader/lightning-accounts)

## Setup

```sh
yarn
yarn build
yarn test
```

Node 24 and Yarn 1.22.22 are supported.

## Full development stack

Keep `trucoshi-client` beside this repository, then run:

```sh
yarn dev:all
```

Docker builds the pinned Lightning Accounts revision and starts PostgreSQL,
Bitcoin regtest, LND, Lightning Accounts, Trucoshi, and the client. A separate
Lightning Accounts checkout is not needed. The first build requires internet
access; later runs can use Docker's cache. The launcher uses a repository-local
Yarn link for Trucoshi and passes the game-server URL and read-only admission
token to the client automatically. If `.env` is missing, it creates one from
the local development defaults without overwriting an existing file.

If Docker requires sudo, use `yarn dev:all:sudo-docker`. Do not run Yarn or the
launcher itself with sudo.

## npm package

The [`trucoshi`](https://www.npmjs.com/package/trucoshi) package provides the
shared event contract, protocol types, and card library. It includes the
TypeScript sources and build configuration for the published JavaScript.

To rebuild an unpacked package:

```sh
yarn source:install
yarn build:package-source
```

Docker server images use the pinned dependencies in `server-runtime/`. Run
`yarn runtime:verify` after changing a runtime manifest.

## Operations

Health probes are available at `GET /health/live` and `GET /health/ready`.
Admission controls are available at `GET /ops/status`, `POST /ops/drain`, and
`POST /ops/resume`.

The example operations tokens work only as local development defaults. Replace
them with different whitespace-free random values in any shared or production
environment. `APP_OPS_STATUS_TOKEN` is read-only; `APP_OPS_TOKEN` authorizes
drain and resume operations.

Betting is enabled only when `APP_BETS_ENABLED=1`. Configure
`APP_MAX_BET`, `APP_RAKE_PERCENT`, and a Lightning Accounts application user
before enabling it outside local development. The complete development stack
ships with betting enabled against its regtest wallet. Lightning Accounts must
have `WALLET_ENABLED=1`, and the application email must be listed in
`APPLICATION_EMAILS` with the APPLICATION or ADMIN role.

## CLI

```sh
yarn cli:play
yarn cli:autoplay
```

## Donations

[Donate Bitcoin](https://jfrader.com/tips)

## License

Copyright (C) 2023-2026 jfrader.

Trucoshi is licensed under GPL-3.0-or-later. See [LICENSE](LICENSE).
