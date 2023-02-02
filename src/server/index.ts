import { randomUUID } from "crypto"
import { createServer } from "http"
import { Server, Socket } from "socket.io"
import { IPlayInstance } from "../lib/classes/Play"
import { IPublicPlayer } from "../lib/classes/Player"
import { IMatchTable, MatchTable } from "./classes/MatchTable"
import { IUser, User } from "./classes/User"
import { EClientEvent, EServerEvent, IWaitingPlayData, TrucoshiSocket } from "../types"

const PORT = process.env.NODE_PORT || 4001
const ORIGIN = process.env.NODE_ORIGIN || "http://localhost:3000"

const httpServer = createServer()
const io = new Server(httpServer, {
  cors: {
    origin: ORIGIN,
    methods: ["GET", "POST"],
  },
})

const users = new Map<string, IUser>() // sessionId, user
const tables = new Map<string, IMatchTable>() // sessionId, table
const turns = new Map<string, { play: IPlayInstance; resolve(): void }>() // sessionId, play instance

const getUser = (session?: string) => {
  const user = users.get(session as string)
  if (user) {
    return user
  }
  throw new Error("User not found")
}

const getTable = (matchSessionId?: string) => {
  const table = tables.get(matchSessionId as string)
  if (table) {
    return table
  }
  throw new Error("Match Session not found")
}

const getTableSockets = (
  table: IMatchTable,
  callback: (playerSocket: TrucoshiSocket) => Promise<void>
) => {
  return new Promise<void>(async (resolve) => {
    const sockets = await io.sockets.adapter.fetchSockets({
      rooms: new Set([table.matchSessionId]),
    })

    for (const playerSocket of sockets) {
      await callback(playerSocket)
    }

    resolve()
  })
}

const emitMatchUpdate = async (table: IMatchTable, skipSocketIds: Array<string> = []) => {
  await getTableSockets(table, async (playerSocket: TrucoshiSocket) => {
    if (skipSocketIds.includes(playerSocket.id)) {
      return
    }
    playerSocket.emit(
      EServerEvent.UPDATE_MATCH,
      table.getPublicMatch(playerSocket.session as string)
    )
  })
}

const sendWaitingForPlay = async (table: IMatchTable, play: IPlayInstance) =>
  new Promise<void>((resolve, reject) => {
    return getTableSockets(table, async (playerSocket) => {
      if (playerSocket.session && playerSocket.session === play.player?.session) {
        playerSocket.emit(
          EServerEvent.WAITING_PLAY,
          table.getPublicMatch(playerSocket.session),
          (data: IWaitingPlayData) => {
            if (!data) {
              return reject(new Error("Callback returned empty"))
            }
            const { cardIdx, card, command } = data
            if (cardIdx !== undefined && card) {
              const playedCard = play.use(cardIdx, card)
              if (playedCard) {
                return resolve()
              }
              return reject(new Error("Invalid Card"))
            }
            if (command) {
              const saidCommand = play.say(command)
              if (saidCommand) {
                return resolve()
              }
              return reject(new Error("Invalid Command"))
            }
            return reject(new Error("Invalid Callback response"))
          }
        )
      }
    })
  })

const startMatch = async (tableId: string) => {
  const table = getTable(tableId)
  if (table && !table.lobby.gameLoop) {
    table.lobby
      .startMatch()
      .onTurn((play) => {
        return new Promise<void>(async (resolve) => {
          table.setCurrentPlayer(play.player as IPublicPlayer)
          turns.set(table.matchSessionId, { play, resolve })

          try {
            const session = play.player?.session as string
            if (!session || !play) {
              throw new Error("Unexpected Error")
            }
            const user = users.get(session)
            if (!user) {
              throw new Error("Unexpected Error")
            }

            await emitMatchUpdate(table)
            await sendWaitingForPlay(table, play)

            return resolve()
          } catch (e) {
            console.error("ERROR", e)
          }
        })
      })
      .onTruco(async (play) => {})
      .onWinner(async () => {})
      .begin()

    return tables.set(tableId as string, table)
  }
  throw new Error("Table not found or already started")
}

const addSocketToUser = (session: string, socketId: string, table: IMatchTable) => {
  const user = getUser(session)

  const socketIds = user.matchSocketIds?.get(table.matchSessionId)

  if (socketIds && socketIds.has(socketId)) {
    return
  }

  console.log("User got new match socket", { socketId, session, matchId: table.matchSessionId })

  const currentMatchSockets = user.matchSocketIds.has(table.matchSessionId)
    ? (user.matchSocketIds.get(table.matchSessionId) as Set<string>)
    : new Set<string>()

  users.set(session, {
    ...user,
    matchSocketIds: user.matchSocketIds.set(
      table.matchSessionId,
      currentMatchSockets.add(socketId)
    ),
  })
}

const getCurrentMatch = (socket: TrucoshiSocket, currentMatchId: string) => {
  if (!currentMatchId || !socket.session) {
    return
  }

  const currentTable = tables.get(currentMatchId)

  if (currentTable) {
    addSocketToUser(socket.session, socket.id, currentTable)
    socket.join(currentTable.matchSessionId)

    if (
      currentTable.isSessionPlaying(socket.session) &&
      socket.session === currentTable.currentPlayer?.session
    ) {
      try {
        const { play, resolve } = turns.get(currentTable.matchSessionId) || {}
        if (!play) {
          throw new Error("Unexpected Error")
        }
        sendWaitingForPlay(currentTable, play).then(resolve).catch(console.error)
      } catch (e) {
        console.error("ERROR", e)
      }
    } else {
      socket.emit(EServerEvent.UPDATE_MATCH, currentTable.getPublicMatch(socket.session))
    }
  }
}

io.on("connection", (_socket) => {
  const socket = _socket as TrucoshiSocket

  console.log("New socket", socket.id)

  socket.on("disconnect", (_reason) => {
    try {
      const user = getUser(socket.session)
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
    if (socket.session) {
      try {
        const user = getUser(socket.session)
        const existingTable = user.ownedMatchId && tables.get(user.ownedMatchId)
        if (existingTable) {
          return callback({
            success: false,
            match: existingTable.getPublicMatch(socket.session),
          })
        }

        const matchId = randomUUID()
        const table = MatchTable(matchId, socket.session)
        user.ownedMatchId = matchId
        table.lobby.addPlayer(user.id, socket.session, 0, true)
        socket.join(matchId)

        addSocketToUser(socket.session, socket.id, table)

        tables.set(matchId, table)
        return callback({ success: true, match: table.getPublicMatch(user.id) })
      } catch (e) {
        console.error("ERROR", e)
        return callback({ success: false, error: e })
      }
    }
    callback({ success: false, error: new Error("Can't create match without an ID") })
  })

  /**
   * Start Match
   */
  socket.on(EClientEvent.START_MATCH, (callback) => {
    if (!callback) {
      return
    }
    try {
      const user = getUser(socket.session)
      const matchId = user.ownedMatchId
      if (matchId) {
        startMatch(matchId)
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
    if (!socket.session) {
      return callback({ success: false })
    }
    try {
      const user = getUser(socket.session)
      const table = tables.get(matchSessionId)

      if (table) {
        table.lobby.addPlayer(user.id, socket.session, teamIdx)

        socket.join(table.matchSessionId)

        addSocketToUser(socket.session, socket.id, table)

        emitMatchUpdate(table)

        return callback({ success: true, match: table.getPublicMatch(socket.session) })
      }
    } catch (e) {
      console.error("ERROR", e)
    }
    callback({ success: false })
  })

  /**
   * Get Match
   * @deprecated
   */
  socket.on(EClientEvent.GET_MATCH, (matchSessionId, callback) => {
    const table = tables.get(matchSessionId)
    if (table) {
      return callback({ success: true, match: table.getPublicMatch(socket.session) })
    }
    callback({ success: false })
  })

  /**
   * Get match ids
   */
  socket.on(EClientEvent.LIST_MATCHES, (callback) => {
    callback({ success: true, matchIds: tables.keys() })
  })

  /**
   * Set Session
   */
  socket.on(EClientEvent.SET_SESSION, (session, id, currentMatchId = null, callback = () => {}) => {
    id = id || "Satoshi"
    const user = users.get(session)
    if (user) {
      const updatedUser: IUser = {
        ...user,
        id,
      }
      users.set(session, updatedUser)
      socket.session = session
      getCurrentMatch(socket, currentMatchId)
      return callback({ success: true, session })
    }

    const newSession = randomUUID()
    socket.session = newSession
    users.set(newSession, User(id))
    getCurrentMatch(socket, currentMatchId)
    callback({ success: true, session: newSession })
  })

  /**
   * Set Player Ready
   */
  socket.on(EClientEvent.SET_PLAYER_READY, (matchSessionId, ready, callback) => {
    try {
      const table = getTable(matchSessionId)
      const player = table.lobby.players.find(
        (player) => player && player.session === socket.session
      )
      if (player) {
        player.setReady(ready)
        emitMatchUpdate(table, [socket.id])
        callback({ success: true, match: table.getPublicMatch(socket.session) })
      }
    } catch (e) {
      callback({ success: false })
    }
  })
})

httpServer.listen(PORT)

console.log("Listening on", PORT, " from origin at", ORIGIN)
