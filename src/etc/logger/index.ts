import { pino } from "pino"

import * as dotenv from 'dotenv'

dotenv.config()

const transport = pino.transport({
  target: "pino-pretty",
  options: { destination: 1 },
})

const logger = pino({ level: process.env.NODE_DEBUG_LEVEL }, transport)

// const defaultLogger = {
//   debug: console.log,
//   fatal: console.log,
//   info: console.log,
//   error: console.log,
//   trace: console.log,
// } as any

export default logger
