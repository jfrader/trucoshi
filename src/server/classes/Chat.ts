import { EChatSystem, EClientEvent, EServerEvent, IChatMessage, IChatRoom, TMap } from "../../types"
import { TrucoshiServer } from "./SocketServer"

const SYSTEM_ID = "system"

export interface IChat {
  rooms: TMap<string, IChatRoom>
  create(id: string): void
}

const ChatUser = (id: string) => {
  return {
    id,
    key: id,
  }
}

const ChatMessage = ({
  user,
  system,
  command,
  content,
}: {
  user: IChatMessage["user"]
  content: string
  system?: boolean
  command?: boolean
}) => {
  return {
    date: Date.now() / 1000,
    user,
    content,
    system: system || false,
    command: command || false,
  }
}

const ChatRoom = (io: TrucoshiServer, id: string) => {
  const room: IChatRoom = {
    id,
    messages: [],
    send(user, content) {
      room.messages.push(
        ChatMessage({
          user,
          content,
        })
      )
      room.emit()
    },
    system(content) {
      room.messages.push(
        ChatMessage({
          user: ChatUser(SYSTEM_ID),
          content,
          system: true,
        })
      )
      room.emit()
    },
    command(team, command) {
      room.messages.push(
        ChatMessage({
          user: ChatUser(EChatSystem[team]),
          content: command,
          command: true,
        })
      )
      room.emit()
    },
    emit() {
      io.sockets.adapter
        .fetchSockets({
          rooms: new Set([room.id]),
        })
        .then((sockets) => {
          for (const playerSocket of sockets) {
            playerSocket.emit(EServerEvent.UPDATE_CHAT, { id: room.id, messages: room.messages })
          }
        })
    },
  }

  return room
}

export const Chat = (io: TrucoshiServer) => {
  const chat: IChat = {
    rooms: new TMap(),
    create(id) {
      const room = ChatRoom(io, id)
      const exists = chat.rooms.get(id)
      if (exists) {
        return
      }
      chat.rooms.set(id, room)
    },
  }

  const adapter = io.of("/").adapter

  adapter.on("join-room", (room, socketId) => {
    const userSocket = io.sockets.sockets.get(socketId)

    if (!userSocket || !userSocket.data.user) {
      return
    }

    const { id, key } = userSocket.data.user

    chat.rooms.get(room)?.system(`${id} entro a la sala`)

    userSocket.on(EClientEvent.CHAT, (matchId, message, callback) => {
      if (matchId !== room || !userSocket.data.user) {
        return
      }
      const chatroom = chat.rooms.get(matchId)

      if (chatroom) {
        chatroom.send({ id, key }, message)
      }
      callback()
    })
  })

  adapter.on("leave-room", (room, socketId) => {
    const userSocket = io.sockets.sockets.get(socketId)

    if (!userSocket || !userSocket.data.user) {
      return
    }

    const { id } = userSocket.data.user
    chat.rooms.get(room)?.system(`${id} salio de la sala`)
  })

  return chat
}
