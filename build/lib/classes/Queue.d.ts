export interface IQueue {
    promise: Promise<void>;
    queue(operation: () => any): Promise<void>;
}
export declare const Queue: () => IQueue;
