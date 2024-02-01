import { ICard } from "../types"


export const PLAYER_ABANDON_TIMEOUT = 1000 * 60
export const PLAYER_TURN_TIMEOUT = 1000 * 30
export const PREVIOUS_HAND_ACK_TIMEOUT = 1000 * 5

export const CARDS = {
  "1e": 13,
  "1b": 12,
  "7e": 11,
  "7o": 10,
  "3e": 9,
  "3o": 9,
  "3b": 9,
  "3c": 9,
  "2e": 8,
  "2o": 8,
  "2b": 8,
  "2c": 8,
  "1o": 7,
  "1c": 7,
  re: 6,
  ro: 6,
  rb: 6,
  rc: 6,
  ce: 5,
  co: 5,
  cb: 5,
  cc: 5,
  pe: 4,
  po: 4,
  pb: 4,
  pc: 4,
  "7b": 3,
  "7c": 3,
  "6e": 2,
  "6o": 2,
  "6b": 2,
  "6c": 2,
  "5e": 1,
  "5o": 1,
  "5b": 1,
  "5c": 1,
  "4e": 0,
  "4o": 0,
  "4b": 0,
  "4c": 0,
}

export const BURNT_CARD = "xx" as ICard

export const CARDS_HUMAN_READABLE = {
  "1e": "1🗡️",
  "1b": "1🌵",
  "7e": "7🗡️",
  "7o": "7💰",
  "3e": "3🗡️",
  "3o": "3💰",
  "3b": "3🌵",
  "3c": "3🍷",
  "2e": "2🗡️",
  "2o": "2💰",
  "2b": "2🌵",
  "2c": "2🍷",
  "1o": "1💰",
  "1c": "1🍷",
  re: "12🗡️",
  ro: "12💰",
  rb: "12🌵",
  rc: "12🍷",
  ce: "11🗡️",
  co: "11💰",
  cb: "11🌵",
  cc: "11🍷",
  pe: "10🗡️",
  po: "10💰",
  pb: "10🌵",
  pc: "10🍷",
  "7b": "7🌵",
  "7c": "7🍷",
  "6e": "6🗡️",
  "6o": "6💰",
  "6b": "6🌵",
  "6c": "6🍷",
  "5e": "5🗡️",
  "5o": "5💰",
  "5b": "5🌵",
  "5c": "5🍷",
  "4e": "4🗡️",
  "4o": "4💰",
  "4b": "4🌵",
  "4c": "4🍷",
}

export const TEAM_SIZE_VALUES = [1, 2, 3]
