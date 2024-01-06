"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.userRepository = void 0;
const logger_1 = __importDefault(require("../../utils/logger"));
const userRepository = (client) => {
    const createUser = ({ accountId }) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const user = yield client.user.create({
                data: {
                    accountId,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            });
            return { success: true, user };
        }
        catch (e) {
            logger_1.default.debug(e, "Error creating user");
            return { success: false, session: null };
        }
    });
    return { createUser };
};
exports.userRepository = userRepository;
