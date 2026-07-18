import { GAME_ERROR } from "../../types"

export class SocketError {
  public code = GAME_ERROR.UNEXPECTED_ERROR
  public name = GAME_ERROR.UNEXPECTED_ERROR
  public message = ""
  public stack: any

  constructor(code?: keyof typeof GAME_ERROR, message?: string) {
    this.code = GAME_ERROR[code || "UNEXPECTED_ERROR"]
    this.name = GAME_ERROR[code || "UNEXPECTED_ERROR"]
    this.message = message || "Ocurrio un error inesperado, intenta nuevamente"
    if (process.env.NODE_ENV === "development") {
      this.stack = new Error(this.message).stack
    }
  }
}

export const isSocketError = (e: unknown, code?: keyof typeof GAME_ERROR) =>
  e instanceof SocketError
    ? e
    : new SocketError(
        code || "UNEXPECTED_ERROR",
        typeof e === "object" &&
          e !== null &&
          "message" in e &&
          typeof e.message === "string" &&
          process.env.NODE_ENV === "development"
          ? e.message
          : undefined
      )

/** Socket.IO connection middleware requires a real Error with public data metadata. */
export const toSocketMiddlewareError = (e: unknown) => {
  const socketError = isSocketError(e)
  const middlewareError = new Error(socketError.message) as Error & {
    data: { code: GAME_ERROR }
  }
  middlewareError.name = socketError.name
  middlewareError.data = { code: socketError.code }
  return middlewareError
}
