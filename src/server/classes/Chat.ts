import { randomUUID } from "crypto"
import { IChatMessage, IChatRoom } from "../../types"
import { TrucoshiServer } from "./Trucoshi"
import logger from "../../utils/logger"
import { TMap } from "./TMap"
import { EClientEvent, EServerEvent } from "../../events"
import { IMatchTable } from "./MatchTable"

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
    emit(message) {
      io.to(room.id).emit(EServerEvent.NEW_MESSAGE, room.id, message)
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
          if (matchingSockets.filter((s) => s.data.user?.key === key).length <= 1) {
            log.debug(`${name} entro a la sala ${room}`)
            chatroom.system(`${name} entro a la sala`, true)
          }
        })

      userSocket.emit(EServerEvent.UPDATE_CHAT, { id: chatroom.id, messages: chatroom.messages })
    }

    userSocket.on(EClientEvent.CHAT, (matchId, message, callback) => {
      if (matchId !== room || !userSocket.data.user) {
        return
      }
      const chatroom = chat.rooms.get(matchId)

      const player = tables
        .get(matchId)
        ?.lobby.players.find((p) => p.key === userSocket.data.user?.key)

      if (chatroom) {
        chatroom.send({ name, key, teamIdx: player?.teamIdx }, message, true)
      }
      callback()
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
          chat.rooms.get(room)?.system(`${name} salió de la sala`, "leave")
        }
      })
  })

  return chat
}
