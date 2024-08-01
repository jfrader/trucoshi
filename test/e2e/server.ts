import { io as Client, Socket } from "socket.io-client"
import { assert, expect } from "chai"
import { trucoshi } from "../../src/server/middlewares/trucoshi"
import { ICard, IPublicMatch } from "../../src/types"
import { ITrucoshi, Trucoshi, TrucoshiSocket } from "../../src/server/classes"
import { session } from "../../src/server"
import { playRandomMatch } from "./serverHelpers"
import {
  ClientToServerEvents,
  EClientEvent,
  EServerEvent,
  ServerToClientEvents,
} from "../../src/events"

describe("Socket Server", () => {
  let serverSocket: TrucoshiSocket
  let clients: Socket<ServerToClientEvents, ClientToServerEvents>[] = []
  let server: ITrucoshi

  before((done) => {
    server = Trucoshi({ port: Number(process.env.APP_PORT) || 9999, serverVersion: "1" })

    server.listen(
      (io) => {
        io.use(session(server))
        io.use(trucoshi(server))

        for (let i = 0; i < 6; i++) {
          clients.push(
            Client(`http://localhost:${process.env.APP_PORT || 9999}`, {
              autoConnect: false,
              withCredentials: true,
              auth: { name: "player" + i },
            })
          )
        }

        io.on("connection", (socket) => {
          serverSocket = socket
          socket.setMaxListeners(50)
        })

        const promises = clients.map(
          (c) =>
            new Promise<void>((res) => {
              c.on(EServerEvent.SET_SESSION, ({ session, name }) => {
                if ((c.auth as any).sessionID !== session) {
                  c.auth = { name, sessionID: session }
                }
                res()
              })

              c.on("connect_error", (e) => {
                console.log("CONNECT ERROR")
                console.error(e)
              })

              c.connect()
            })
        )

        Promise.all(promises).then(() => done())
      },
      { redis: false, lightningAccounts: false, store: false }
    )
  })

  after(() => {
    server.io.close()
    clients.forEach((c) => c.close())
  })

  beforeEach(() => {
    clients.map((c) => c.removeAllListeners())
  })

  it("should send ping", (done) => {
    clients[0].on(EServerEvent.PONG, (_a, b) => {
      assert.equal(b, 123)
      done()
    })
    clients[0].emit(EClientEvent.PING, 123)
  })

  it("should play an entire match", async () => {
    let matchId: string | undefined
    let match0: IPublicMatch | undefined
    let match1: IPublicMatch | undefined

    let winningResolve = () => {}
    const WinnerPromise = new Promise<void>((res) => {
      winningResolve = res
    })

    clients[0].on(EServerEvent.UPDATE_MATCH, (match) => {
      match0 = match
    })

    clients[1].on(EServerEvent.UPDATE_MATCH, (match) => {
      match1 = match
      if (match.winner) {
        winningResolve()
      }
    })

    clients[0].on(EServerEvent.WAITING_PLAY, (match, callback) => {
      match0 = match
      const data = { card: match.me?.hand.at(0) as ICard, cardIdx: 0 }
      if (!data.card || data.cardIdx === undefined) {
        console.error("WTF")
        console.log(data)
        process.exit(1)
      }
      callback(data)
    })

    clients[1].on(EServerEvent.WAITING_PLAY, (match, callback) => {
      match1 = match
      const data = { card: match.me?.hand.at(0) as ICard, cardIdx: 0 }
      if (!data.card || data.cardIdx === undefined) {
        console.error("WTF")
        console.log(data)
        process.exit(1)
      }
      callback(data)
    })

    clients[0].on(EServerEvent.PREVIOUS_HAND, (match, callback) => {
      expect(match.matchSessionId === matchId)
      callback()
    })

    clients[1].on(EServerEvent.PREVIOUS_HAND, (match, callback) => {
      expect(match.matchSessionId === matchId)
      callback()
    })

    await new Promise<void>((res) => {
      clients[0].emit(EClientEvent.CREATE_MATCH, ({ match }) => {
        expect(Boolean(match?.matchSessionId)).to.equal(true)
        matchId = match?.matchSessionId
        match0 = match
        res()
      })
    })

    await new Promise<void>((res) => {
      clients[1].emit(EClientEvent.JOIN_MATCH, matchId as string, 1, ({ success, match }) => {
        expect(success).to.equal(true)
        expect(match?.matchSessionId).to.equal(matchId)
        expect(Boolean(match?.players.find((player) => player.name === "player1"))).to.equal(true)
        match1 = match
        res()
      })
    })

    const setReady = [
      new Promise<void>((res) => {
        clients[0].emit(EClientEvent.SET_PLAYER_READY, matchId as string, true, ({ success }) => {
          expect(success).to.equal(true)
          res()
        })
      }),
      new Promise<void>((res) => {
        clients[1].emit(EClientEvent.SET_PLAYER_READY, matchId as string, true, ({ success }) => {
          expect(success).to.equal(true)
          res()
        })
      }),
    ]
    await Promise.all(setReady)

    await new Promise<void>((res) => {
      clients[0].emit(
        EClientEvent.START_MATCH,
        matchId as string,
        ({ success, matchSessionId }) => {
          expect(success).to.equal(true)
          expect(matchSessionId).to.equal(matchId)
          res()
        }
      )
    })

    await WinnerPromise

    expect(match0?.winner?.points.buenas).to.be.greaterThanOrEqual(9)
  })

  it("should play a random match of 2 players", async () => {
    await playRandomMatch(clients.slice(0, 2))
  })

  it("should play a random match of 4 players", async () => {
    await playRandomMatch(clients.slice(0, 4))
  })

  it("should play a random match of 6 players", async () => {
    await playRandomMatch(clients)
  })

  it("should play 5 matches in parallel", (done) => {
    const promises: Array<() => Promise<void>> = []
    for (let i = 0; i < 5; i++) {
      promises.push(() => playRandomMatch(clients))
    }

    Promise.all(promises.map((p) => p())).then(() => done())
  })

  it("should play 5 matches in series", async () => {
    for (let i = 0; i < 5; i++) {
      await playRandomMatch(clients)
    }
  })
})
