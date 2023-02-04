import { randomUUID } from "crypto"
import { MatchTable } from "./classes/MatchTable"
import { IUser, User } from "./classes/User"
import { EClientEvent, EServerEvent, IEventCallback } from "../types"
import { Trucoshi } from "./classes/Trucoshi"
import { SocketServer } from "./classes/SocketServer"

const PORT = process.env.NODE_PORT || 4001
const ORIGIN = process.env.NODE_ORIGIN || "http://localhost:3000"

const server = SocketServer(Trucoshi(), Number(PORT), [ORIGIN])

server.io.on("connection", (socket) => {
  console.log("New socket", socket.id)

  socket.on("disconnect", (_reason) => {
    try {
      const user = server.users.getOrThrow(socket.data.user?.session)
      if (user) {
        user.disconnect()
      }
    } catch (e) {
      // noop
    }
  })

  socket.on(EClientEvent.PING, (msg) => {
    socket.emit(EServerEvent.PONG, msg)
  })

  /**
   * Create Match
   */
  socket.on(EClientEvent.CREATE_MATCH, (callback) => {
    if (socket.data.user) {
      try {
        const user = server.users.getOrThrow(socket.data.user.session)
        const existingTable = user.ownedMatchId && server.tables.get(user.ownedMatchId)
        if (existingTable) {
          return callback({
            success: false,
            match: existingTable.getPublicMatch(socket.data.user.session),
          })
        }

        const matchId = randomUUID()
        const table = MatchTable(matchId, socket.data.user.session)

        user.ownedMatchId = matchId

        table.lobby.addPlayer(user.key, user.id, socket.data.user.session, 0, true)

        server.chat.create(matchId)
        socket.join(matchId)
        server.tables.set(matchId, table)

        return callback({ success: true, match: table.getPublicMatch(user.id) })
      } catch (e) {
        return callback({ success: false })
      }
    }
    callback({ success: false })
  })

  /**
   * Start Match
   */
  socket.on(EClientEvent.START_MATCH, (callback) => {
    if (!callback) {
      return
    }
    try {
      const user = server.users.getOrThrow(socket.data.user?.session)
      const matchId = user.ownedMatchId
      if (matchId) {
        server.startMatch(matchId)
        return callback({ success: true, matchSessionId: matchId })
      }
    } catch (e) {
      callback({ success: false })
    }
    callback({ success: false })
  })

  /**
   * Join Match
   */
  socket.on(EClientEvent.JOIN_MATCH, (matchSessionId, teamIdx, callback) => {
    if (!socket.data.user) {
      return callback({ success: false })
    }
    try {
      const user = server.users.getOrThrow(socket.data.user.session)
      const table = server.tables.get(matchSessionId)

      if (table) {
        table.lobby.addPlayer(user.key, user.id, user.session, teamIdx)

        socket.join(table.matchSessionId)

        server.sendMatchUpdate(table)

        return callback({ success: true, match: table.getPublicMatch(socket.data.user.session) })
      }
      callback({ success: false })
    } catch (e) {
      callback({ success: false })
    }
  })

  /**
   * Get public matches
   */
  socket.on(EClientEvent.LIST_MATCHES, (filters = {}, callback) => {
    const publicMatches = server.tables.getAll(filters)
    callback({ success: true, matches: publicMatches })
  })

  const setOrGetSession = (
    id: string | null,
    session: string | null,
    callback: IEventCallback<{
      session?: string
    }> = () => {}
  ) => {
    if (session) {
      const user = server.users.get(session)
      if (user) {
        const newId = id || user.id || "Satoshi"
        user.connect()
        user.setId(newId)
        socket.data.user = user
        return callback({ success: true, session })
      }
    }

    const newSession = randomUUID()
    const userKey = randomUUID()
    const newId = id || "Satoshi"
    const newUser = User(userKey, newId, newSession)
    socket.data.user = newUser
    server.users.set(newSession, newUser)
    callback({ success: false, session: newSession })
  }

  /**
   * Set Session
   */
  socket.on(EClientEvent.SET_SESSION, (id, session, callback = () => {}) => {
    if (!callback) {
      return
    }
    setOrGetSession(id, session, ({ success, session }) => {
      if (session && success) {
        const activeMatches = server.tables
          .findAll((table) => Boolean(table.isSessionPlaying(session)))
          .map((match) => match.getPublicMatchInfo())
        return callback({ success, session, activeMatches })
      }
      callback({ success, session, activeMatches: [] })
    })
  })

  socket.on(EClientEvent.FETCH_MATCH, (session, matchId, callback) => {
    return setOrGetSession(null, session, ({ success }) => {
      if (!success) {
        return callback({ success: false, match: null })
      }

      server.chat.rooms.get(matchId)?.emit()
      const match = server.sendCurrentMatch(socket, matchId)
      callback({ success: Boolean(match), match })
    })
  })

  /**
   * Set Player Ready
   */
  socket.on(EClientEvent.SET_PLAYER_READY, (matchSessionId, ready, callback) => {
    try {
      const table = server.tables.getOrThrow(matchSessionId)
      const player = table.lobby.players.find(
        (player) => player && player.session === socket.data.user?.session
      )
      if (player) {
        player.setReady(ready)
        server.sendMatchUpdate(table, [socket.id])
        callback({ success: true, match: table.getPublicMatch(socket.data.user?.session) })
      }
    } catch (e) {
      callback({ success: false })
    }
  })
})

server.listen()
