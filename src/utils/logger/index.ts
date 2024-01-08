import { pino } from "pino"

import * as dotenv from "dotenv"

dotenv.config()

const transport = pino.transport({
  target: "pino-pretty",
  options: { destination: 1, colorize: true },
  
  levels: {
    
  },
})

const logger = pino({ level: process.env.NODE_DEBUG_LEVEL }, transport)

export default logger
