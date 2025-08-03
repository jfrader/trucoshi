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

  io.on("connection", (socket) => {
    log.debug({ socketId: socket.id }, "Socket connected")

    // Initialize throttler for SAY events
    const sayHandler = throttle(
      (message, toTeamIdx, fromUser, matchId) => {
        const chatroom = chat.rooms.get(matchId)
        if (chatroom) {
          log.debug(
            { socketId: socket.id, matchId, message },
            `Processing throttled SAY event for ${fromUser.name}`
          )
          chatroom.sound(message, toTeamIdx, fromUser)
        } else {
          log.warn({ socketId: socket.id, matchId }, `Chat room not found for SAY event`)
        }
      },
      4000,
      { leading: true, trailing: false }
    )

    socket.data.throttler = sayHandler

    // Attach CHAT listener
    socket.on(EClientEvent.CHAT, (matchId, message, callback) => {
      log.debug({ socketId: socket.id, matchId, message }, `Received CHAT event`)

      if (!socket.data.user) {
        log.warn({ socketId: socket.id, matchId }, `CHAT event rejected: no user data`)
        return callback?.({ success: false })
      }

      const chatroom = chat.rooms.get(matchId)
      if (!chatroom) {
        log.warn({ socketId: socket.id, matchId }, `CHAT event rejected: chat room not found`)
        return callback?.({ success: false })
      }

      const player = tables.get(matchId)?.lobby.players.find((p) => p.key === socket.data.user?.key)

      if (!player) {
        log.warn(
          { socketId: socket.id, matchId, key: socket.data.user?.key },
          `CHAT event rejected: player not found`
        )
        return callback?.({ success: false })
      }

      chatroom.send(
        { name: socket.data.user.name, key: socket.data.user.key, teamIdx: player.teamIdx },
        message,
        true
      )
      callback?.({ success: true })
    })

    // Attach SAY listener
    socket.on(EClientEvent.SAY, (matchId, message, callback) => {
      log.debug({ socketId: socket.id, matchId, message }, `Received SAY event`)

      if (!socket.data.user) {
        log.warn({ socketId: socket.id, matchId }, `SAY event rejected: no user data`)
        return callback?.({ success: false })
      }

      const player = tables.get(matchId)?.lobby.players.find((p) => p.key === socket.data.user?.key)

      if (!player) {
        log.warn(
          { socketId: socket.id, matchId, key: socket.data.user?.key },
          `SAY event rejected: player not found`
        )
        return callback?.({ success: false })
      }

      socket.data.throttler?.(message, undefined, socket.data.user, matchId)
      callback?.({ success: true })
    })

    // Clean up on disconnect
    socket.on("disconnect", () => {
      log.debug({ socketId: socket.id }, `Socket disconnected, clearing listeners and throttler`)
      socket.removeAllListeners(EClientEvent.CHAT)
      socket.removeAllListeners(EClientEvent.SAY)
      socket.data.throttler = undefined
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
            matchingSockets.length <= 1 ||
            matchingSockets.filter((s) => s.data.user?.key === key).length <= 1
          ) {
            log.debug({ socketId, room }, `${name} entro a la sala ${room}`)
            chatroom.system(`${name} entro a la sala`, true)
          }
        })

      userSocket.emit(EServerEvent.UPDATE_CHAT, {
        id: chatroom.id,
        messages: chatroom.messages,
      })
    } else {
      log.warn({ socketId, room }, `Join-room failed: chat room not found`)
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

    io.in(userSocket.data.user?.session)
      .fetchSockets()
      .then((matchingSockets) => {
        const isDisconnected = matchingSockets.length === 0
        if (userSocket.data.user && isDisconnected) {
          const { name } = userSocket.data.user
          const chatroom = chat.rooms.get(room)
          if (chatroom) {
            log.debug({ socketId, room }, `${name} salió de la sala ${room}`)
            chatroom.system(`${name} salió de la sala`, "leave")
          }
        }
      })
  })

  return chat
}
