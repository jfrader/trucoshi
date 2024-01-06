"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Queue = void 0;
const logger_1 = __importDefault(require("../../utils/logger"));
const Queue = () => {
    const queue = {
        promise: Promise.resolve(),
        queue(operation) {
            return new Promise((resolve) => {
                queue.promise = queue.promise
                    .then(operation)
                    .then(resolve)
                    .catch((e) => {
                    logger_1.default.error(e, "Error in queue operation %o", operation);
                    resolve();
                });
            });
        },
    };
    return queue;
};
exports.Queue = Queue;
