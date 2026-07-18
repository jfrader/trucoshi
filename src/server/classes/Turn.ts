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
    this.resolve = turn.resolve
    this.cancel = turn.cancel
    this.retry = turn.retry
  }
}
