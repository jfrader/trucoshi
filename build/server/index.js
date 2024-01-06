"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = __importDefault(require("../utils/logger"));
const classes_1 = require("./classes");
const fs_1 = require("fs");
__exportStar(require("./classes"), exports);
__exportStar(require("./constants"), exports);
__exportStar(require("./middlewares"), exports);
const dotenv = __importStar(require("dotenv"));
const middlewares_1 = require("./middlewares");
let version = "";
dotenv.config();
exports.default = () => {
    process.on("unhandledRejection", (reason, promise) => {
        logger_1.default.fatal({ reason, promise }, "UNHANDLED REJECTION!");
    });
    process.on("uncaughtException", (reason, promise) => {
        logger_1.default.fatal({ reason, promise }, "UNCAUGHT EXCEPTION!");
    });
    try {
        const data = (0, fs_1.readFileSync)(__dirname + "/../../package.json", "utf8");
        const pkg = JSON.parse(data);
        version = pkg.version;
    }
    catch (e) {
        logger_1.default.error(e, "Failed to read package.json");
        process.exit(1);
    }
    logger_1.default.info("Starting Trucoshi " + process.env.NODE_ENV + " server version " + version);
    const PORT = process.env.NODE_PORT || 4001;
    const ORIGIN = process.env.NODE_ORIGIN || "http://localhost:3000";
    const server = (0, classes_1.Trucoshi)({ port: Number(PORT), origin: [ORIGIN], serverVersion: version });
    server.listen((io) => {
        logger_1.default.info(`Listening on port ${PORT} accepting origin ${ORIGIN}`);
        io.use((0, middlewares_1.session)(server));
        io.use((0, middlewares_1.trucoshi)(server));
    });
};
