"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hash = void 0;
const { createHash } = require("crypto");
const salt = process.env.NODE_SALT;
function hash(str) {
    return createHash("sha256")
        .update(str)
        .update(createHash("sha256").update(salt, "utf8").digest("hex"))
        .digest("hex");
}
exports.hash = hash;
