import * as rng from "safe-rng"
import { IRandom } from "../../types"

export const Random = () => {
  const random: IRandom = {
    secret: rng.generateServerSeed(),
    clients: [],
    nonce: 0,
    pick(key, max) {
      return rng.generateInteger(random.clients[key], random.secret, random.nonce, 0, max)
    },
    next() {
      random.nonce++
    },
    reveal() {
      return { secret: random.secret, clients: random.clients }
    },
  }

  return random
}
