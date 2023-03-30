import { EClientEvent, EServerEvent, IChatMessage, IChatRoom, TMap } from "../../types"
import { TrucoshiServer } from "./Trucoshi"

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
  card,
}: Partial<IChatMessage> & Pick<IChatMessage, "user">): IChatMessage => {
  return {
    date: Date.now() / 1000,
    user,
    content: content || "",
    system: system || false,
    command: command || false,
    card: card || false,
  }
}

const ChatRoom = (io: TrucoshiServer, id: string) => {
  const room: IChatRoom = {
    id,
    messages: [],
    send(user, content) {
      const message = ChatMessage({
        user,
        content,
      })
      room.messages.push(message)
      room.emit(message)
    },
    system(content) {
      const message = ChatMessage({
        user: ChatUser(SYSTEM_ID),
        content,
        system: true,
      })
      room.messages.push(message)
      room.emit(message)
    },
    command(team, command) {
      const message = ChatMessage({
        user: ChatUser(team.toString()),
        content: String(command),
        command: true,
      })
      room.messages.push(message)
      room.emit(message)
    },
    card(user, card) {
      const message = ChatMessage({
        user,
        content: String(card),
        card: true,
      })
      room.messages.push(message)
      room.emit(message)
    },
    emit(message) {
      io.to(room.id).emit(
        EServerEvent.UPDATE_CHAT,
        { id: room.id, messages: room.messages },
        message
      )
    },
  }

  return room
}

export const Chat = (io: TrucoshiServer) => {
  const chat: IChat = {
    rooms: new TMap(),
    create(id) {
      if (chat.rooms.has(id)) {
        return
      }
      const room = ChatRoom(io, id)
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
