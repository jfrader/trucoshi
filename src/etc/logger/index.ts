import { pino } from "pino"

const transport = pino.transport({
  target: "pino-pretty",
  options: { destination: 1 },
})

const logger = pino({ level: "trace" }, transport)

// const defaultLogger = {
//   debug: console.log,
//   fatal: console.log,
//   info: console.log,
//   error: console.log,
//   trace: console.log,
// } as any

export default logger
