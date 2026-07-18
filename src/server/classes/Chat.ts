import { randomUUID } from "crypto"
import { IChatMessage, IChatRoom } from "../../types"
import { TrucoshiServer } from "./Trucoshi"
import { TMap } from "./TMap"
import { EClientEvent, EServerEvent } from "../../events"
import { IMatchTable } from "./MatchTable"
import logger from "../../utils/logger"
import throttle from "lodash.throttle"
import sanitizeHtml from "sanitize-html"

const log = logger.child({ class: "Chat" })

const SYSTEM_ID = "system"
const MAX_MESSAGE_LENGTH = 200
const MAX_MATCH_ID_LENGTH = 128
const CLIENT_SAY_MESSAGES = new Set<string>(["mate", "ceba_toma_mate"])

const isMatchId = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= MAX_MATCH_ID_LENGTH &&
  value.trim() === value &&
  !/[\u0000-\u001f\u007f]/.test(value)

const hasOptionalAck = (socketId: string, event: EClientEvent, callback: unknown) => {
  if (callback === undefined || typeof callback === "function") {
    return true
  }
  log.warn(
    { socketId, event, callbackType: typeof callback },
    "Chat event rejected: acknowledgement callback is invalid"
  )
  return false
}

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
      if (teamIdx !== undefined) {
        io.to(room.id + teamIdx).emit(EServerEvent.NEW_MESSAGE, room.id, message)
      } else {
        io.to(room.id).emit(EServerEvent.NEW_MESSAGE, room.id, message)
      }
    },
  }

  return room
}

const sanitizeMessage = (message: string): string => {
  return sanitizeHtml(message, {
    allowedTags: [],
    allowedAttributes: {},
    textFilter: (text) => {
      return text.trim().replace(/[\n\r]+/g, " ")
    },
  })
}

const validateMessage = (message: unknown): message is string => {
  if (typeof message !== "string") {
    return false
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return false
  }
  return true
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
    const sayHandler = throttle(
      (message, toTeamIdx, fromUser, matchId) => {
        const chatroom = chat.rooms.get(matchId)
        if (!chatroom) {
          log.warn({ socketId: socket.id, matchId }, `Chat room not found for SAY event`)
          return
        }
        log.trace(
          { socketId: socket.id, matchId },
          `Processing throttled SAY event for ${fromUser.name}`
        )
        chatroom.sound(message, toTeamIdx, fromUser)
      },
      4000,
      { leading: true, trailing: false }
    )

    socket.data.throttler = sayHandler

    socket.on("disconnect", () => {
      socket.removeAllListeners(EClientEvent.CHAT)
      socket.removeAllListeners(EClientEvent.SAY)
      socket.data.throttler = undefined
    })

    socket.on(EClientEvent.CHAT, (matchId, message, callback) => {
      if (!hasOptionalAck(socket.id, EClientEvent.CHAT, callback)) return
      log.debug(
        {
          socketId: socket.id,
          matchId: isMatchId(matchId) ? matchId : undefined,
          messageLength: typeof message === "string" ? message.length : undefined,
        },
        "Received CHAT event"
      )

      if (
        !isMatchId(matchId) ||
        matchId !== chat.rooms.get(matchId)?.id ||
        !socket.data.user ||
        !socket.rooms.has(matchId)
      ) {
        log.warn(
          { socketId: socket.id },
          "CHAT event rejected: invalid matchId, no user data, or no room membership"
        )
        return callback?.({ success: false })
      }

      if (!validateMessage(message)) {
        log.warn({ socketId: socket.id, matchId }, "Invalid CHAT message rejected")
        return callback?.({ success: false })
      }

      const sanitizedMessage = sanitizeMessage(message)
      if (!validateMessage(sanitizedMessage)) {
        log.warn({ socketId: socket.id, matchId }, "Invalid sanitized CHAT message rejected")
        return callback?.({ success: false })
      }

      // Spectators are allowed to chat after FETCH_MATCH establishes server-side room membership.
      const player = tables.get(matchId)?.lobby.players.find((p) => p.key === socket.data.user?.key)

      const chatroom = chat.rooms.get(matchId)
      if (!chatroom) {
        log.warn({ socketId: socket.id, matchId }, "Chat room not found for CHAT event")
        return callback?.({ success: false })
      }

      if (sanitizedMessage === "") {
        log.warn({ socketId: socket.id, matchId }, "Message is empty")
        return callback?.({ success: false })
      }

      chatroom.send(
        {
          name: socket.data.user.name,
          key: socket.data.user.key,
          teamIdx: player?.teamIdx,
        },
        sanitizedMessage,
        true
      )
      callback?.({ success: true })
    })

    socket.on(EClientEvent.SAY, (matchId, message, callback) => {
      if (!hasOptionalAck(socket.id, EClientEvent.SAY, callback)) return
      if (
        !isMatchId(matchId) ||
        matchId !== chat.rooms.get(matchId)?.id ||
        !socket.data.user ||
        !socket.rooms.has(matchId) ||
        typeof message !== "string" ||
        !CLIENT_SAY_MESSAGES.has(message)
      ) {
        log.warn(
          { socketId: socket.id },
          "SAY event rejected: invalid matchId, message, user data, or room membership"
        )
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
  })

  adapter.on("join-room", (room, socketId) => {
    const chatroom = chat.rooms.get(room)

    if (!chatroom) {
      return
    }

    const userSocket = io.sockets.sockets.get(socketId)
    if (!userSocket || !userSocket.data.user) {
      log.debug(
        { room, socketId },
        `Tried to JOIN room but there's no session data or no socket was found`
      )
      return
    }

    const { name, key } = userSocket.data.user

    io.in(room)
      .fetchSockets()
      .then((matchingSockets) => {
        if (
          matchingSockets.length <= 1 ||
          matchingSockets.filter((s) => s.data.user?.key === key).length <= 1
        ) {
          log.info({ socketId, room }, `${name} entro a la sala ${room}`)
          chatroom.system(`${name} entro a la sala`, true)
        }
      })
      .catch((error) => {
        log.error(
          {
            socketId,
            room,
            errorType: error instanceof Error ? error.name : "UnknownError",
          },
          `Error fetching sockets for join-room event`
        )
      })

    userSocket.emit(EServerEvent.UPDATE_CHAT, {
      id: chatroom.id,
      messages: chatroom.messages,
    })
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
            log.info({ socketId, room }, `${name} salió de la sala ${room}`)
            chatroom.system(`${name} salió de la sala`, "leave")
          }
        }
      })
      .catch((error) => {
        log.error(
          {
            socketId,
            room,
            errorType: error instanceof Error ? error.name : "UnknownError",
          },
          `Error fetching sockets for leave-room event`
        )
      })
  })

  return chat
}
