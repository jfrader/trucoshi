export interface IQueue {
  promise: Promise<any>
  queue(operation: () => any): Promise<any>
}

export const Queue = () => {
  const queue: IQueue = {
    promise: Promise.resolve(true),
    queue(operation) {
      return new Promise((resolve) => {
        queue.promise = queue.promise.then(operation).then(resolve).catch(resolve)
      })
    },
  }

  return queue
}
