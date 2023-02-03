import { randomUUID } from "crypto"
import { MatchTable } from "./classes/MatchTable"
import { IUser, User } from "./classes/User"
import { EClientEvent, EServerEvent } from "../types"
import { Trucoshi } from "./classes/Trucoshi"
import { SocketServer } from "./classes/SocketServer"

const PORT = process.env.NODE_PORT || 4001
const ORIGIN = process.env.NODE_ORIGIN || "http://localhost:3000"

const server = SocketServer(Trucoshi(), Number(PORT), [ORIGIN])

server.io.on("connection", (socket) => {
  console.log("New socket", socket.id)

  socket.on("disconnect", (_reason) => {
    try {
      const user = server.users.getOrThrow(socket.data.session)
      user.matchSocketIds.forEach((sockets) => sockets.delete(socket.id))
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
    if (socket.data.session) {
      try {
        const user = server.users.getOrThrow(socket.data.session)
        const existingTable = user.ownedMatchId && server.tables.get(user.ownedMatchId)
        if (existingTable) {
          return callback({
            success: false,
            match: existingTable.getPublicMatch(socket.data.session),
          })
        }

        const matchId = randomUUID()
        const table = MatchTable(matchId, socket.data.session)

        user.ownedMatchId = matchId

        table.lobby.addPlayer(user.id, socket.data.session, 0, true)

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
      const user = server.users.getOrThrow(socket.data.session)
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
    if (!socket.data.session) {
      return callback({ success: false })
    }
    try {
      const user = server.users.getOrThrow(socket.data.session)
      const table = server.tables.get(matchSessionId)

      if (table) {
        table.lobby.addPlayer(user.id, socket.data.session, teamIdx)

        socket.join(table.matchSessionId)

        server.sendMatchUpdate(table)

        return callback({ success: true, match: table.getPublicMatch(socket.data.session) })
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

  /**
   * Set Session
   */
  socket.on(EClientEvent.SET_SESSION, (session, id, callback = () => {}) => {
    id = id || "Satoshi"
    if (session) {
      const user = server.users.get(session)
      if (user) {
        const updatedUser: IUser = {
          ...user,
          id,
        }
        server.users.set(session, updatedUser)
        socket.data.session = session

        const activeMatches = server.tables
          .findAll((table) => Boolean(table.isSessionPlaying(session)))
          .map((match) => match.getPublicMatchInfo())

        return callback({ success: true, session, activeMatches })
      }
    }

    const newSession = randomUUID()
    socket.data.session = newSession
    server.users.set(newSession, User(id))
    callback({ success: true, session: newSession, activeMatches: [] })
  })

  socket.on(EClientEvent.FETCH_MATCH, (session, matchId, callback) => {
    if (session) {
      const user = server.users.get(session)
      if (user) {
        socket.data.session = session
        const match = server.sendCurrentMatch(socket, matchId)
        return callback({ success: true, match })
      }
    }
    callback({ success: false })
  })

  /**
   * Set Player Ready
   */
  socket.on(EClientEvent.SET_PLAYER_READY, (matchSessionId, ready, callback) => {
    try {
      const table = server.tables.getOrThrow(matchSessionId)
      const player = table.lobby.players.find(
        (player) => player && player.session === socket.data.session
      )
      if (player) {
        player.setReady(ready)
        server.sendMatchUpdate(table, [socket.id])
        callback({ success: true, match: table.getPublicMatch(socket.data.session) })
      }
    } catch (e) {
      callback({ success: false })
    }
  })
})

server.listen()
