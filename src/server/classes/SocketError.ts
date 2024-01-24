import { GAME_ERROR } from "../../types"

export class SocketError {
  public code = GAME_ERROR.UNEXPECTED_ERROR
  public message = ""
  public stack: any

  constructor(code?: keyof typeof GAME_ERROR, message?: string) {
    this.code = GAME_ERROR[code || "UNEXPECTED_ERROR"]
    this.message = message || "Ocurrio un error inesperado, intenta nuevamente"
    if (process.env.NODE_ENV === "development") {
      this.stack = new Error(this.message).stack
    }
  }
}

export const isSocketError = (e: any) =>
  e instanceof SocketError
    ? e
    : new SocketError(
        "UNEXPECTED_ERROR",
        "message" in e && process.env.NODE_ENV === "development" ? e.message : undefined
      )
