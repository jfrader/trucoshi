import { pino } from "pino"

import * as dotenv from "dotenv"

dotenv.config()

const transport = pino.transport({
  target: "pino-pretty",
  options: { colorize: true },
})

const logger = pino(
  { level: process.env.APP_DEBUG_LEVEL },
  transport
)

export default logger
