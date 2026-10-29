import { IPlayInstance } from "../../truco"

interface ITrucoshiTurn {
  play: IPlayInstance
  timeout: NodeJS.Timeout | null
  createdAt: number
  pausedAt?: number
  resolve: () => void
  retry: (pausedTime?: number) => void
  cancel: () => void
}

export class TrucoshiTurn implements ITrucoshiTurn {
  settled = false
  play: IPlayInstance
  timeout: NodeJS.Timeout | null
  createdAt: number
  pausedAt?: number
  resolve: () => void
  retry: (pausedTime?: number) => void
  cancel: () => void

  constructor(turn: ITrucoshiTurn) {
    this.play = turn.play
    this.createdAt = Date.now()
    this.timeout = turn.timeout
    const settle = (callback: () => void) => {
      if (this.settled) return
      this.settled = true
      if (this.timeout) clearTimeout(this.timeout)
      this.timeout = null
      callback()
    }
    this.resolve = () => settle(turn.resolve)
    this.cancel = () => settle(turn.cancel)
    this.retry = (pausedTime) => {
      if (!this.settled) turn.retry(pausedTime)
    }
  }
}
