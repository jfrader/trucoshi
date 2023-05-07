import logger from "../../utils/logger"

export interface IQueue {
  promise: Promise<void>
  queue(operation: () => any): Promise<void>
}

export const Queue = () => {
  const queue: IQueue = {
    promise: Promise.resolve(),
    queue(operation) {
      return new Promise<void>((resolve) => {
        queue.promise = queue.promise
          .then(operation)
          .then(resolve)
          .catch((e) => {
            logger.error(e, "Error in queue operation %o", operation)
            resolve()
          })
      })
    },
  }

  return queue
}
