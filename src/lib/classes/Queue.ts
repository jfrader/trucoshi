import logger from "../../utils/logger"

const log = logger.child({ class: "Queue" })

export interface IQueue {
  promise: Promise<void>
  queue<T>(operation: () => Promise<T>): Promise<T>
}

export const Queue = () => {
  const queue: IQueue = {
    promise: Promise.resolve(),
    queue<T>(operation: () => Promise<T>) {
      return new Promise<T>((resolve, reject) => {
        queue.promise = queue.promise
          .then(operation)
          .then(resolve)
          .catch((e) => {
            log.error(e, "Error in queue operation %o", operation)
            reject(e)
          })
      })
    },
  }
  return queue
}
