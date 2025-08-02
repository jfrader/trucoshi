import { randomUUID } from "crypto"
import { IChatMessage, IChatRoom } from "../../types"
import { TrucoshiServer } from "./Trucoshi"
import { TMap } from "./TMap"
import { EClientEvent, EServerEvent } from "../../events"
import { IMatchTable } from "./MatchTable"
import logger from "../../utils/logger"
import throttle from "lodash.throttle"

const log = logger.child({ class: "Chat" })

const SYSTEM_ID = "system"

export interface IChat {
  rooms: TMap<string, IChatRoom>
  create(id: string): void
  delete(id: string): void
}

const ChatUser = (name: string, teamIdx?: 0 | 1) => {
  return {
    name,
    teamIdx,
    key: name,
  }
}

const ChatMessage = ({
  user,
  system,
  command,
  content,
  card,
  hidden,
  sound,
}: Partial<IChatMessage> & Pick<IChatMessage, "user">): IChatMessage => {
  return {
    id: randomUUID(),
    date: Math.floor(Date.now() / 1000),
    user,
    content: content ?? "",
    system: system ?? false,
    command: command ?? false,
    card: card ?? false,
    sound: sound ?? false,
    hidden,
  }
}

const ChatRoom = (io: TrucoshiServer, id: string) => {
  const room: IChatRoom = {
    id,
    messages: [],
    socket: {
      emit(socket) {
        const userSocket = io.sockets.sockets.get(socket)
        userSocket?.emit(EServerEvent.UPDATE_CHAT, { id: room.id, messages: room.messages })
      },
    },
    send(user, content, sound) {
      const message = ChatMessage({
        user,
        content,
        sound,
      })
      room.messages.push(message)
      room.emit(message)
    },
    sound(sound, toTeamIdx, fromUser = ChatUser(SYSTEM_ID)) {
      const message = ChatMessage({
        user: fromUser,
        content: "",
        system: true,
        hidden: true,
        sound,
      })
      room.emit(message, toTeamIdx)
    },
    system(content, sound) {
      const message = ChatMessage({
        user: ChatUser(SYSTEM_ID),
        content,
        system: true,
        sound,
      })
      room.messages.push(message)
      room.emit(message)
    },
    command(team, command, sound) {
      const message = ChatMessage({
        user: ChatUser(team.toString(), team),
        content: `${command}`,
        command: true,
        sound,
      })
      room.messages.push(message)
      room.emit(message)
    },
    card(user, card, sound) {
      const message = ChatMessage({
        user,
        content: String(card),
        card: true,
        sound,
      })
      room.messages.push(message)
      room.emit(message)
    },
    emit(message, teamIdx) {
      if (teamIdx) {
        io.to(room.id + teamIdx).emit(EServerEvent.NEW_MESSAGE, room.id, message)
      } else {
        io.to(room.id).emit(EServerEvent.NEW_MESSAGE, room.id, message)
      }
    },
  }

  return room
}

export const Chat = (io?: TrucoshiServer, tables?: TMap<string, IMatchTable>) => {
  if (!io || !tables) {
    return {} as IChat
  }

  const chat: IChat = {
    rooms: new TMap(),
    create(id) {
      if (chat.rooms.has(id)) {
        return
      }
      const room = ChatRoom(io, id)
      chat.rooms.set(id, room)
    },
    delete(id) {
      chat.rooms.delete(id)
    },
  }

  const adapter = io.of("/").adapter

  // Initialize listeners tracking on socket connection
  io.on("connection", (socket) => {
    // Ensure socket.data.listeners is initialized
    socket.data.listeners = socket.data.listeners ?? new Set<string>()

    socket.on("disconnect", () => {
      // Clean up listeners on disconnect
      socket.removeAllListeners(EClientEvent.CHAT)
      socket.removeAllListeners(EClientEvent.SAY)
      socket.data.listeners?.clear() // Clear all tracked listeners
      socket.data.throttler = undefined // Clear throttler
    })
  })

  adapter.on("join-room", (room, socketId) => {
    const userSocket = io.sockets.sockets.get(socketId)

    if (!userSocket || !userSocket.data.user) {
      log.debug(
        { room, socketId },
        `Tried to JOIN room but there's no session data or no socket was found`
      )
      return
    }

    const { name, key } = userSocket.data.user
    const chatroom = chat.rooms.get(room)

    if (chatroom) {
      io.in(room)
        .fetchSockets()
        .then((matchingSockets) => {
          if (
            "filter" in matchingSockets &&
            matchingSockets.filter((s) => s.data.user?.key === key).length <= 1
          ) {
            log.debug(`${name} entro a la sala ${room}`)
            chatroom.system(`${name} entro a la sala`, true)
          }
        })

      userSocket.emit(EServerEvent.UPDATE_CHAT, {
        id: chatroom.id,
        messages: chatroom.messages,
      })
    }

    // Ensure socket.data.listeners is initialized
    userSocket.data.listeners = userSocket.data.listeners ?? new Set<string>()

    // Add CHAT listener only if not already added
    if (!userSocket.data.listeners.has(EClientEvent.CHAT)) {
      userSocket.on(EClientEvent.CHAT, (matchId, message, callback) => {
        if (matchId !== room || !userSocket.data.user) {
          return callback?.({ success: false })
        }

        const player = tables
          .get(matchId)
          ?.lobby.players.find((p) => p.key === userSocket.data.user?.key)

        if (chatroom) {
          chatroom.send({ name, key, teamIdx: player?.teamIdx }, message, true)
        }
        callback?.({ success: true })
      })
      userSocket.data.listeners.add(EClientEvent.CHAT)
    }

    // Add SAY listener only if not already added
    if (!userSocket.data.listeners.has(EClientEvent.SAY)) {
      const sayHandler = throttle(
        (message, toTeamIdx, fromUser) => {
          chatroom?.sound(message, toTeamIdx, fromUser)
        },
        4000,
        { leading: true, trailing: false }
      )

      userSocket.on(EClientEvent.SAY, (matchId, message, callback) => {
        if (matchId !== room || !userSocket.data.user) {
          return callback?.({ success: false })
        }

        const player = tables
          .get(matchId)
          ?.lobby.players.find((p) => p.key === userSocket.data.user?.key)

        if (!player) {
          return callback?.({ success: false })
        }

        userSocket.data.throttler = userSocket.data.throttler ?? sayHandler

        userSocket.data.throttler(message, undefined, userSocket.data.user)

        callback?.({ success: true })
      })
      userSocket.data.listeners.add(EClientEvent.SAY)
    }
  })

  adapter.on("leave-room", (room, socketId) => {
    const userSocket = io.sockets.sockets.get(socketId)

    if (!userSocket || !userSocket.data.user) {
      log.debug(
        { room, socketId },
        `Tried to LEAVE room but there's no session data or no socket was found`
      )
      return
    }

    // Remove CHAT and SAY listeners when leaving a room
    userSocket.removeAllListeners(EClientEvent.CHAT)
    userSocket.removeAllListeners(EClientEvent.SAY)
    userSocket.data.listeners?.clear() // Clear all tracked listeners
    userSocket.data.throttler = undefined // Clear throttler

    io.in(userSocket.data.user?.session)
      .fetchSockets()
      .then((matchingSockets) => {
        const isDisconnected = "length" in matchingSockets && matchingSockets.length === 0
        if (userSocket.data.user && isDisconnected) {
          const { name } = userSocket.data.user
          chat.rooms.get(room)?.system(`${name} salió de la sala`, "leave")
        }
      })
  })

  return chat
}
