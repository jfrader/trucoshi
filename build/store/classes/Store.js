"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Store = void 0;
const user_1 = require("../repositories/user");
const Store = (client) => {
    const store = {
        client,
        user: (0, user_1.userRepository)(client),
    };
    return store;
};
exports.Store = Store;
