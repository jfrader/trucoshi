"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const findAxiosResponseCookie = (r, cookieName) => {
    var _a, _b;
    return (_b = (_a = r.headers["set-cookie"]
        .find((cookie) => cookie.includes(cookieName))) === null || _a === void 0 ? void 0 : _a.match(new RegExp(`^${cookieName}=(.+?);`))) === null || _b === void 0 ? void 0 : _b[1];
};
exports.default = findAxiosResponseCookie;
