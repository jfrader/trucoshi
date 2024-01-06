"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.accountsApi = void 0;
const lightning_accounts_1 = require("lightning-accounts");
const api = new lightning_accounts_1.Api({
    baseURL: process.env.NODE_LIGHTNING_ACCOUNTS_URL,
    withCredentials: true,
    secure: process.env.NODE_ENV === "production",
    headers: {
        Cookie: "Lightning-Application-Token=admin@trucoshi.com:trucoshi123aaklsjdlaksdjlkas2ll2j2mmmcjkj1n2n3nn123;",
    },
});
exports.accountsApi = api;
