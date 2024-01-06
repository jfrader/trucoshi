"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPublicKey = void 0;
const getPublicKey = () => {
    return Buffer.from(process.env.NODE_LIGHTNING_ACCOUNTS_JWT_PUBLIC_KEY || "", "base64").toString();
};
exports.getPublicKey = getPublicKey;
