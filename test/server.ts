import { io as Client, Socket } from "socket.io-client"
import { assert, expect } from "chai"
import { trucoshi } from "../src/server/middlewares/trucoshi"
import {
  ClientToServerEvents,
  EClientEvent,
  EServerEvent,
  ICard,
  IPublicMatch,
  ServerToClientEvents,
} from "../src/types"
import { ITrucoshi, Trucoshi, TrucoshiSocket } from "../src/server/classes"

describe("Socket Server", () => {
  let serverSocket: TrucoshiSocket

  let clientSocket0: Socket<ServerToClientEvents, ClientToServerEvents>

  let clientSocket1: Socket<ServerToClientEvents, ClientToServerEvents>

  let server: ITrucoshi

  before((done) => {
    server = Trucoshi({ port: 9999, serverVersion: "1" })

    server.listen((io) => {
      io.use(trucoshi(server))

      clientSocket0 = Client(`http://localhost:9999`)
      clientSocket1 = Client(`http://localhost:9999`)
      io.on("connection", (socket) => {
        serverSocket = socket
      })

      const promises = [
        new Promise<void>((res) => {
          clientSocket0.on("connect", () => res())
        }),
        new Promise<void>((res) => {
          clientSocket1.on("connect", () => res())
        }),
      ]

      Promise.all(promises).then(() => done())
    })
  })

  after(() => {
    server.io.close()
    clientSocket0.close()
    clientSocket1.close()
  })

  it("should send ping", (done) => {
    clientSocket0.on(EServerEvent.PONG, (_a, b) => {
      assert.equal(b, 123)
      done()
    })
    clientSocket0.emit(EClientEvent.PING, 123)
  })

  it("should play an entire match", async () => {
    let client0session: string | undefined
    let client1session: string | undefined
    let matchId: string | undefined
    let match0: IPublicMatch | undefined
    let match1: IPublicMatch | undefined

    let winningResolve = () => {}
    const WinnerPromise = new Promise<void>((res) => {
      winningResolve = res
    })

    const setSessions = [
      new Promise<void>((res) => {
        clientSocket0.emit(EClientEvent.SET_SESSION, "player1", null, ({ success, session }) => {
          expect(success).be.equal(false)
          client0session = session
          res()
        })
      }),
      new Promise<void>((res) => {
        clientSocket1.emit(
          EClientEvent.SET_SESSION,
          "player2",
          "inexistentsession",
          ({ success, session }) => {
            expect(success).be.equal(false)
            expect(session).be.not.equal("inexistentsession")
            client1session = session
            res()
          }
        )
      }),
    ]
    await Promise.all(setSessions)

    clientSocket0.on(EServerEvent.UPDATE_MATCH, (match) => {
      match0 = match
    })

    clientSocket1.on(EServerEvent.UPDATE_MATCH, (match) => {
      match1 = match
      if (match.winner) {
        winningResolve()
      }
    })

    clientSocket0.on(EServerEvent.WAITING_PLAY, (match, callback) => {
      match0 = match
      const data = { card: match.me?.hand.at(0) as ICard, cardIdx: 0 }
      if (!data.card || data.cardIdx === undefined) {
        console.error("WTF")
        console.log(data)
        process.exit(1)
      }
      callback(data)
    })

    clientSocket1.on(EServerEvent.WAITING_PLAY, (match, callback) => {
      match1 = match
      const data = { card: match.me?.hand.at(0) as ICard, cardIdx: 0 }
      if (!data.card || data.cardIdx === undefined) {
        console.error("WTF")
        console.log(data)
        process.exit(1)
      }
      callback(data)
    })

    clientSocket0.on(EServerEvent.PREVIOUS_HAND, (match, callback) => {
      expect(match.matchSessionId === matchId)
      callback()
    })

    clientSocket1.on(EServerEvent.PREVIOUS_HAND, (match, callback) => {
      expect(match.matchSessionId === matchId)
      callback()
    })

    await new Promise<void>((res) => {
      clientSocket0.emit(EClientEvent.CREATE_MATCH, ({ match }) => {
        expect(Boolean(match?.matchSessionId)).to.equal(true)
        matchId = match?.matchSessionId
        match0 = match
        res()
      })
    })

    await new Promise<void>((res) => {
      clientSocket1.emit(EClientEvent.JOIN_MATCH, matchId as string, 1, ({ success, match }) => {
        expect(success).to.equal(true)
        expect(match?.matchSessionId).to.equal(matchId)
        expect(Boolean(match?.players.find((player) => player.id === "player1"))).to.equal(true)
        match1 = match
        res()
      })
    })

    const setReady = [
      new Promise<void>((res) => {
        clientSocket0.emit(
          EClientEvent.SET_PLAYER_READY,
          matchId as string,
          true,
          ({ success }) => {
            expect(success).to.equal(true)
            res()
          }
        )
      }),
      new Promise<void>((res) => {
        clientSocket1.emit(
          EClientEvent.SET_PLAYER_READY,
          matchId as string,
          true,
          ({ success }) => {
            expect(success).to.equal(true)
            res()
          }
        )
      }),
    ]
    await Promise.all(setReady)

    await new Promise<void>((res) => {
      clientSocket0.emit(
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
})
