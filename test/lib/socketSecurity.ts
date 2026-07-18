import { expect } from "chai"
import { AddressInfo } from "net"
import * as sinon from "sinon"
import { io as Client, Socket } from "socket.io-client"
import {
  ClientToServerEvents,
  EClientEvent,
  EServerEvent,
  ServerToClientEvents,
} from "../../src/events"
import { ITrucoshi, Trucoshi, TrucoshiSocket } from "../../src/server/classes"
import { sessionMiddleware, trucoshiMiddleware } from "../../src/server/middlewares"
import { EMatchState } from "../../src/types"

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>

const nextTurn = () => new Promise<void>((resolve) => setImmediate(resolve))
const shortDelay = () => new Promise<void>((resolve) => setTimeout(resolve, 25))

const waitForServerRoomEvent = (
  socket: TrucoshiSocket,
  event: EClientEvent.JOIN_ROOM | EClientEvent.LEAVE_ROOM,
  expectedRoom: string
) =>
  new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(event, listener)
      reject(new Error(`Timed out waiting for server to receive ${event}`))
    }, 500)
    const listener = (room: string) => {
      clearTimeout(timeout)
      if (room === expectedRoom) {
        resolve()
        return
      }
      reject(new Error(`Server received ${event} for unexpected room ${room}`))
    }

    // Middleware listeners are registered when the socket connects. This observer is
    // therefore called after the room guard has handled the same server-side event.
    socket.once(event, listener)
  })

const connectClient = (port: number, name: string) =>
  new Promise<ClientSocket>((resolve, reject) => {
    const client: ClientSocket = Client(`http://127.0.0.1:${port}`, {
      autoConnect: false,
      reconnection: false,
      auth: { name },
    })
    const timeout = setTimeout(() => reject(new Error(`Timed out connecting ${name}`)), 2000)

    client.once("connect", () => {
      clearTimeout(timeout)
      resolve(client)
    })
    client.once("connect_error", (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    client.connect()
  })

describe("Socket room security", () => {
  let server: ITrucoshi
  let owner: ClientSocket
  let spectator: ClientSocket
  let matchId: string

  before(async () => {
    server = Trucoshi({ port: 0, serverVersion: "socket-security-test" })
    await server.listen(
      (io) => {
        io.use(sessionMiddleware(server))
        io.use(trucoshiMiddleware(server))
      },
      { redis: false, lightningAccounts: false, store: false }
    )

    const port = (server.httpServer.address() as AddressInfo).port
    owner = await connectClient(port, "owner")
    spectator = await connectClient(port, "spectator")

    matchId = await new Promise<string>((resolve, reject) => {
      owner.emit(EClientEvent.CREATE_MATCH, ({ success, match, error }) => {
        if (success && match) {
          resolve(match.matchSessionId)
          return
        }
        reject(error || new Error("Failed to create security test match"))
      })
    })
  })

  after(async () => {
    owner?.close()
    spectator?.close()
    await server?.close()
  })

  it("only lets clients subscribe to the two public rooms", async () => {
    const serverSocket = server.io.sockets.sockets.get(spectator.id as string)
    expect(serverSocket).to.not.equal(undefined)
    const attackerRoom = "raw-attacker-room-canary\n"

    const rejectedJoinProcessed = waitForServerRoomEvent(
      serverSocket as TrucoshiSocket,
      EClientEvent.JOIN_ROOM,
      attackerRoom
    )
    spectator.emit(EClientEvent.JOIN_ROOM, attackerRoom)
    await rejectedJoinProcessed
    expect(serverSocket?.rooms.has(attackerRoom)).to.equal(false)

    const rejectedLeaveProcessed = waitForServerRoomEvent(
      serverSocket as TrucoshiSocket,
      EClientEvent.LEAVE_ROOM,
      attackerRoom
    )
    spectator.emit(EClientEvent.LEAVE_ROOM, attackerRoom)
    await rejectedLeaveProcessed

    const publicJoinProcessed = waitForServerRoomEvent(
      serverSocket as TrucoshiSocket,
      EClientEvent.JOIN_ROOM,
      "stats"
    )
    spectator.emit(EClientEvent.JOIN_ROOM, "stats")
    await publicJoinProcessed
    expect(serverSocket?.rooms.has("stats")).to.equal(true)

    const publicLeaveProcessed = waitForServerRoomEvent(
      serverSocket as TrucoshiSocket,
      EClientEvent.LEAVE_ROOM,
      "stats"
    )
    spectator.emit(EClientEvent.LEAVE_ROOM, "stats")
    await publicLeaveProcessed
    expect(serverSocket?.rooms.has("stats")).to.equal(false)
  })

  it("requires a server-established match view before exposing or writing chat", async () => {
    let chatUpdates = 0
    const countChatUpdate = () => {
      chatUpdates += 1
    }
    spectator.on(EServerEvent.UPDATE_CHAT, countChatUpdate)

    spectator.emit(EClientEvent.FETCH_CHAT_ROOM, matchId)
    await shortDelay()
    expect(chatUpdates).to.equal(0)

    for (const invalidRoomId of ["x".repeat(129), `invalid\nroom`]) {
      ;(spectator.emit as any)(EClientEvent.FETCH_CHAT_ROOM, invalidRoomId)
    }
    await shortDelay()
    expect(chatUpdates).to.equal(0)

    const rejectedChat = await new Promise<boolean>((resolve) => {
      spectator.emit(EClientEvent.CHAT, matchId, "not joined", ({ success }) => resolve(success))
    })
    expect(rejectedChat).to.equal(false)

    const malformedChatAccepted = await new Promise<boolean>((resolve) => {
      ;(owner.emit as any)(EClientEvent.CHAT, matchId, { injected: true }, ({ success }) =>
        resolve(success)
      )
    })
    expect(malformedChatAccepted).to.equal(false)

    const oversizedChatAccepted = await new Promise<boolean>((resolve) => {
      ;(owner.emit as any)(EClientEvent.CHAT, matchId, "x".repeat(201), ({ success }) =>
        resolve(success)
      )
    })
    expect(oversizedChatAccepted).to.equal(false)

    for (const invalidMatchId of ["x".repeat(129), `invalid\nmatch`]) {
      const invalidMatchAccepted = await new Promise<boolean>((resolve) => {
        ;(owner.emit as any)(
          EClientEvent.CHAT,
          invalidMatchId,
          "raw-rejected-chat-canary",
          ({ success }) => resolve(success)
        )
      })
      expect(invalidMatchAccepted).to.equal(false)
    }

    for (const invalidMatchId of ["x".repeat(129), { injected: true }]) {
      const invalidFetchAccepted = await new Promise<boolean>((resolve) => {
        ;(spectator.emit as any)(EClientEvent.FETCH_MATCH, invalidMatchId, ({ success }) =>
          resolve(success)
        )
      })
      expect(invalidFetchAccepted).to.equal(false)
    }

    const matchWasFetched = await new Promise<boolean>((resolve) => {
      spectator.emit(EClientEvent.FETCH_MATCH, matchId, ({ success }) => resolve(success))
    })
    expect(matchWasFetched).to.equal(true)
    await nextTurn()

    const serverSocket = server.io.sockets.sockets.get(spectator.id as string)
    expect(serverSocket?.rooms.has(matchId)).to.equal(true)

    const room = await new Promise<{ id: string }>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timed out fetching authorized chat")), 500)
      spectator.once(EServerEvent.UPDATE_CHAT, (nextRoom) => {
        clearTimeout(timeout)
        resolve(nextRoom)
      })
      spectator.emit(EClientEvent.FETCH_CHAT_ROOM, matchId)
    })
    expect(room.id).to.equal(matchId)

    const spectatorSessionId = serverSocket?.data.user?.session
    const spectatorSession = spectatorSessionId
      ? server.sessions.get(spectatorSessionId)
      : undefined
    expect(spectatorSessionId).to.be.a("string")
    expect(spectatorSession).to.not.equal(undefined)
    const updatesBeforeStaleSessionFetch = chatUpdates
    try {
      server.sessions.delete(spectatorSessionId as string)
      spectator.emit(EClientEvent.FETCH_CHAT_ROOM, matchId)
      await shortDelay()
      expect(chatUpdates).to.equal(updatesBeforeStaleSessionFetch)
    } finally {
      server.sessions.set(spectatorSessionId as string, spectatorSession!)
    }

    const acceptedSpectatorChat = await new Promise<boolean>((resolve) => {
      spectator.emit(EClientEvent.CHAT, matchId, "spectator message", ({ success }) =>
        resolve(success)
      )
    })
    expect(acceptedSpectatorChat).to.equal(true)

    const rejectedLeaveProcessed = waitForServerRoomEvent(
      serverSocket as TrucoshiSocket,
      EClientEvent.LEAVE_ROOM,
      matchId
    )
    spectator.emit(EClientEvent.LEAVE_ROOM, matchId)
    await rejectedLeaveProcessed
    expect(serverSocket?.rooms.has(matchId)).to.equal(true)

    spectator.off(EServerEvent.UPDATE_CHAT, countChatUpdate)
  })

  it("rejects malformed match filters and accepts bounded state filters", async () => {
    const malformed = await new Promise<{ success: boolean; matches: unknown[] }>((resolve) => {
      ;(owner.emit as any)(EClientEvent.LIST_MATCHES, { unexpected: true }, resolve)
    })
    expect(malformed.success).to.equal(false)
    expect(malformed.matches).to.deep.equal([])

    const valid = await new Promise<{ success: boolean; matches: unknown[] }>((resolve) => {
      owner.emit(EClientEvent.LIST_MATCHES, { state: [EMatchState.UNREADY] }, resolve as any)
    })
    expect(valid.success).to.equal(true)
    expect(valid.matches.length).to.be.greaterThan(0)
  })

  it("rejects missing or malformed acknowledgements without unhandled rejections", async () => {
    const unhandledRejections: unknown[] = []
    const onUnhandledRejection = (reason: unknown) => {
      unhandledRejections.push(reason)
    }
    process.on("unhandledRejection", onUnhandledRejection)

    try {
      const missingRequiredAcks: any[][] = [
        [EClientEvent.JOIN_QUEUE, { maxPlayers: 2, allowBots: false }],
        [EClientEvent.CREATE_MATCH],
        [EClientEvent.SET_MATCH_OPTIONS, matchId, {}],
        [EClientEvent.START_MATCH, matchId],
        [EClientEvent.JOIN_MATCH, matchId, 1],
        [EClientEvent.ADD_BOT, matchId, 1],
        [EClientEvent.SET_PLAYER_READY, matchId, true],
        [EClientEvent.LIST_MATCHES, {}],
        [EClientEvent.LIST_RANKING, {}],
        [EClientEvent.LOGOUT],
        [EClientEvent.FETCH_MATCH, matchId],
        [EClientEvent.KICK_PLAYER, matchId, "missing-player"],
        [EClientEvent.FETCH_MATCH_DETAILS, 1],
        [EClientEvent.FETCH_ACCOUNT_DETAILS, 1],
      ]
      const malformedOptionalAcks: any[][] = [
        [EClientEvent.LEAVE_QUEUE, "not-a-callback"],
        [EClientEvent.LEAVE_MATCH, matchId, "not-a-callback"],
        [EClientEvent.PAUSE_MATCH, matchId, false, "not-a-callback"],
        [EClientEvent.PLAY_AGAIN, matchId, "not-a-callback"],
        [EClientEvent.CHAT, matchId, "malformed-ack-chat", "not-a-callback"],
        [EClientEvent.SAY, matchId, "mate", "not-a-callback"],
      ]

      for (const args of [...missingRequiredAcks, ...malformedOptionalAcks]) {
        ;(owner.emit as any)(...args)
      }
      await shortDelay()

      expect(unhandledRejections).to.deep.equal([])
      expect(owner.connected).to.equal(true)

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Timed out waiting for PONG")), 500)
        owner.once(EServerEvent.PONG, () => {
          clearTimeout(timeout)
          resolve()
        })
        owner.emit(EClientEvent.PING, Date.now())
      })
    } finally {
      process.off("unhandledRejection", onUnhandledRejection)
    }
  })

  it("rejects arbitrary SAY payloads and scopes team zero messages to team zero", async () => {
    const invalidSayAccepted = await new Promise<boolean>((resolve) => {
      ;(owner.emit as any)(EClientEvent.SAY, matchId, "arbitrary-sound", ({ success }) =>
        resolve(success)
      )
    })
    expect(invalidSayAccepted).to.equal(false)

    const validSayAccepted = await new Promise<boolean>((resolve) => {
      owner.emit(EClientEvent.SAY, matchId, "mate", ({ success }) => resolve(success))
    })
    expect(validSayAccepted).to.equal(true)
    await shortDelay()

    const ownerSocket = server.io.sockets.sockets.get(owner.id as string)
    await ownerSocket?.join(matchId + "0")

    let ownerMessages = 0
    let spectatorMessages = 0
    const ownerListener = () => {
      ownerMessages += 1
    }
    const spectatorListener = () => {
      spectatorMessages += 1
    }
    owner.on(EServerEvent.NEW_MESSAGE, ownerListener)
    spectator.on(EServerEvent.NEW_MESSAGE, spectatorListener)

    server.chat.rooms.getOrThrow(matchId).sound("team-zero-only", 0)
    await shortDelay()

    expect(ownerMessages).to.equal(1)
    expect(spectatorMessages).to.equal(0)
    owner.off(EServerEvent.NEW_MESSAGE, ownerListener)
    spectator.off(EServerEvent.NEW_MESSAGE, spectatorListener)
  })
})

describe("Session handshake security", () => {
  const createSocket = (auth: unknown) =>
    ({
      id: "security-test-socket",
      data: { matches: new Set<string>() },
      handshake: { auth },
      use: sinon.stub(),
      on: sinon.stub(),
      disconnect: sinon.stub(),
    }) as unknown as TrucoshiSocket

  it("returns INVALID_IDENTITY instead of throwing during account reconnection", () => {
    const reconnect = sinon.spy()
    const setName = sinon.spy()
    const userSession = {
      account: { id: 7 },
      session: "account-session",
      reconnect,
      setName,
      getUserData: sinon.stub(),
    }
    const server = {
      sessions: { get: sinon.stub().withArgs("account-session").returns(userSession) },
    } as unknown as ITrucoshi
    const socket = createSocket({
      identity: "not-a-valid-jwt",
      name: "spoofed name",
      sessionID: "account-session",
    })
    const next = sinon.spy()

    expect(() => sessionMiddleware(server)(socket, next)).to.not.throw()
    expect(next.calledOnce).to.equal(true)
    expect(next.firstCall.args[0]).to.be.instanceOf(Error)
    expect(next.firstCall.args[0]?.data?.code).to.equal("INVALID_IDENTITY")
    expect(reconnect.called).to.equal(false)
    expect(setName.called).to.equal(false)
  })

  it("preserves a guest name when a reconnect omits or malforms the name", () => {
    const setName = sinon.spy()
    const getUserData = sinon.stub().returns({
      key: "guest-key",
      name: "Original",
      session: "guest-session",
      account: null,
    })
    const userSession = {
      account: null,
      session: "guest-session",
      reconnect: sinon.spy(),
      setName,
      getUserData,
    }
    const server = {
      sessions: { get: sinon.stub().withArgs("guest-session").returns(userSession) },
    } as unknown as ITrucoshi
    const socket = createSocket({ name: { injected: true }, sessionID: "guest-session" })
    const next = sinon.spy()

    sessionMiddleware(server)(socket, next)

    expect(setName.called).to.equal(false)
    expect(socket.data.user?.name).to.equal("Original")
    expect(next.calledOnceWithExactly()).to.equal(true)
  })

  it("rejects malformed, oversized, and inconsistent identity fields", () => {
    const createUserSession = sinon.stub()
    const server = {
      createUserSession,
      sessions: { get: sinon.stub() },
    } as unknown as ITrucoshi

    const invalidAuthValues = [
      { identity: { token: true }, sessionID: ["guest-session"] },
      { sessionID: "s".repeat(257) },
      { identity: "i".repeat(16 * 1024 + 1), user: { id: 1 } },
      { identity: "signed-token", user: { id: 0 } },
      { identity: "signed-token", user: { id: Number.MAX_SAFE_INTEGER + 1 } },
      { identity: "signed-token" },
      { user: { id: 1 } },
    ]

    for (const auth of invalidAuthValues) {
      const next = sinon.spy()
      sessionMiddleware(server)(createSocket(auth), next)
      expect(next.calledOnce, JSON.stringify(auth)).to.equal(true)
      expect(next.firstCall.args[0], JSON.stringify(auth)).to.be.instanceOf(Error)
      expect(next.firstCall.args[0]?.data?.code, JSON.stringify(auth)).to.equal(
        "INVALID_IDENTITY"
      )
    }
    expect(createUserSession.called).to.equal(false)
  })

  it("accepts a positive safe-integer account id with a bounded identity", async () => {
    const login = sinon.stub().resolves()
    const server = { login } as unknown as ITrucoshi
    const socket = createSocket({ identity: "signed-token", user: { id: 1 } })
    const next = sinon.spy()

    await sessionMiddleware(server)(socket, next)

    expect(login.calledOnce).to.equal(true)
    expect(login.firstCall.args[0].account.id).to.equal(1)
    expect(login.firstCall.args[0].identityJwt).to.equal("signed-token")
    expect(next.calledOnceWithExactly()).to.equal(true)
  })

  it("accepts the client's null initial session as an absent optional field", () => {
    const userSession = {
      connect: sinon.spy(),
      getUserData: sinon.stub().returns({
        key: "new-guest-key",
        name: "New Guest",
        session: "new-guest-session",
        account: null,
      }),
    }
    const createUserSession = sinon.stub().returns(userSession)
    const server = { createUserSession } as unknown as ITrucoshi
    const socket = createSocket({ name: "New Guest", sessionID: null, identity: null, user: null })
    const next = sinon.spy()

    sessionMiddleware(server)(socket, next)

    expect(createUserSession.calledOnce).to.equal(true)
    expect(socket.data.user?.session).to.equal("new-guest-session")
    expect(next.calledOnceWithExactly()).to.equal(true)
  })
})
