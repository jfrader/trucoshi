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

`yarn dev:all:sudo-docker`

Do not prefix the command with `sudo`. The script only uses sudo for Docker commands, and running Yarn itself as root can corrupt local links and generated Prisma files.

# Test

`yarn test`

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

Donate Bitcoin at [geyser.fund/project/trucoshi](https://geyser.fund/project/trucoshi)

# License

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
