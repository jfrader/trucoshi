import words from "./words/spanish.json"

export const getRandomWord = () => {
  return words[Math.floor(Math.random() * words.length)]
}

export const getWordsId = (size = 3, divider = "-") => {
  return Array.from("x".repeat(size))
    .map(() => getRandomWord())
    .join(divider)
}
