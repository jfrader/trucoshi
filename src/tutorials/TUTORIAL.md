# Tutorial System Guide

This guide is for AI agents adding or changing Truco tutorials. The goal is to keep tutorial scripts correct even when the player ignores the suggested move.

## Files

- Tutorial JSON files live in `src/tutorials/`.
- Scenario registration and validation live in `src/tutorials/index.ts`.
- Runtime tutorial behavior lives in `src/server/classes/Tutorial.ts`.
- Tutorial types live in `src/types.ts`.
- Tutorial scenario tests live in `test/lib/tutorials.ts`.

To add a new tutorial, create a JSON file in `src/tutorials/`, import it in `src/tutorials/index.ts`, add it to `TUTORIAL_SCENARIOS`, and update tests.

## Scenario Shape

A tutorial scenario has:

```json
{
  "id": "basic-truco-v1",
  "title": "Truco basico",
  "botProfile": "tutorial",
  "botName": "El Profe",
  "options": { "maxPlayers": 2, "matchPoint": 9 },
  "hands": []
}
```

Current tutorials are validated as 1v1 only: `options.maxPlayers` must be `2`.

Each hand has:

```json
{
  "goal": "Learn a specific rule",
  "cardsByPlayerIdx": {
    "0": ["1e", "7o", "4c"],
    "1": ["3c", "6b", "5o"]
  },
  "messages": [],
  "botActions": []
}
```

Player `0` is the human in the basic tutorial. Player `1` is `El Profe`.

## Cards

Card IDs are compact:

- Suits: `e` espada, `b` basto, `o` oro, `c` copa.
- Numbers: `1`, `2`, `3`, `4`, `5`, `6`, `7`.
- Faces: `p` is 10, `c` is 11, `r` is 12.

Examples:

- `1e`: ancho de espada.
- `1b`: ancho de basto.
- `7e`: siete de espada.
- `7o`: siete de oro.
- `3c`: 3 de copa.
- `rc`: rey de copa.

Do not hardcode card strength in tutorial text when the player can choose a different card. Use `{{roundResult}}`.

## Message Triggers

Messages are emitted when a tutorial step matches the current game event.

Available triggers:

- `hand_start`: beginning of the hand.
- `before_human_turn`: before the human chooses a command or card.
- `after_human_action`: immediately after the human action.
- `before_bot_action`: before the bot acts.
- `after_bot_action`: immediately after the bot action.
- `hand_end`: after the hand finishes.

Optional filters:

- `roundIdx`: 1-based trick round number.
- `state`: game state, such as `WAITING_PLAY`, `WAITING_FOR_TRUCO_ANSWER`, `WAITING_ENVIDO_ANSWER`, `WAITING_ENVIDO_POINTS_ANSWER`.
- `playerIdx`: player index.
- `actionValue`: exact card, command, or number that was just played or answered.
- `roundComplete`: whether the selected round already has both 1v1 cards on the table.
- `roundCardCount`: exact number of cards already played in the selected round.
- `requiresHandCards`: cards the human must still have for this message to fire.
- `requiresRoundCards`: cards that must already be played in the selected round.

Messages are emitted once per message object per match. Reusing the same broad trigger can accidentally consume a message earlier than intended, so scope important messages with `roundIdx`, `state`, and `actionValue`.

## Runtime Result Text

Use the interpolation token `{{roundResult}}` for completed card rounds. It is rendered from the actual cards on the table using `CARDS` strength.

Examples:

- Human wins: `Ganaste la ronda: tu ancho de espada le gana al 3 de copa del Profe.`
- Bot wins: `Gano el Profe: su 3 de copa le gana a tu 4 de copa.`
- Tie: `Parda: tu 3 de espada y el 3 de oro tienen la misma fuerza.`

Example message:

```json
{
  "trigger": "after_bot_action",
  "roundIdx": 1,
  "text": "{{roundResult}} Quien gana una ronda abre la siguiente."
}
```

This remains correct if the player used `1e`, `7e`, `4c`, or any other card.

Rules for `{{roundResult}}`:

- Use it only after both cards in a 1v1 round are down.
- If the round is incomplete, the message is skipped and a warning is logged.
- It assumes one human card and one bot card in the completed round.
- It uses plain Spanish names, not emoji labels.

If turn order can change, avoid `{{roundResult}}` in that spot. Teach the decision before the play, or use neutral copy that does not need the round winner.

```json
{
  "trigger": "before_human_turn",
  "roundIdx": 2,
  "state": "WAITING_PLAY",
  "text": "Usa la menor carta que gane: no gastes mas fuerza de la necesaria."
}
```

Use `roundComplete: false` when you want to talk about a card the player can still answer:

```json
{
  "trigger": "after_bot_action",
  "roundIdx": 2,
  "actionValue": "3o",
  "roundComplete": false,
  "requiresHandCards": ["7o", "1b"],
  "requiresRoundCards": ["3o"],
  "text": "El Profe tiro un 3. El 7 de oro lo mata y deja el ancho de basto guardado."
}
```

Use `roundCardCount` and card requirements for concrete turn-state copy:

```json
{
  "trigger": "before_human_turn",
  "roundIdx": 2,
  "state": "WAITING_PLAY",
  "roundCardCount": 1,
  "requiresRoundCards": ["6b"],
  "requiresHandCards": ["7e"],
  "text": "El Profe tiro el 6 de basto. El 7 de espada lo mata."
}
```

Use `{{previousRoundScore}}` when a later round should explain the real score of earlier rounds:

```json
{
  "trigger": "before_human_turn",
  "roundIdx": 3,
  "state": "WAITING_PLAY",
  "text": "{{previousRoundScore}} Esta tercera define la mano."
}
```

In a normal 1-1 third round, this renders: `Van una ronda ganada cada uno.`

## Bot Actions

Tutorial bot actions script what `El Profe` should do.

```json
{
  "trigger": "before_bot_action",
  "roundIdx": 1,
  "state": "WAITING_PLAY",
  "action": { "type": "card", "value": "3c" }
}
```

Command example:

```json
{
  "trigger": "before_bot_action",
  "state": "WAITING_FOR_TRUCO_ANSWER",
  "action": { "type": "command", "value": "QUIERO" }
}
```

Bot actions are tried in JSON order. The first matching action that can be executed wins. Use `state` when the same trigger and round can happen for different decisions.

If no scripted action matches, the tutorial bot falls back to normal tutorial behavior. Do not rely on fallback behavior for the lesson-critical move.

## Turn Order

This is the most common source of broken tutorials.

In a 2-player tutorial, the opening player alternates by hand. After a trick round, whoever won that round opens the next one. If the round was parda, the game rules decide who continues; do not guess in copy.

Do not write:

```json
{
  "trigger": "before_human_turn",
  "roundIdx": 1,
  "text": "El Profe tiro un 3. Mata con el ancho de espada."
}
```

That text is false if the human is opening the round. Instead split the lesson:

```json
{
  "trigger": "before_human_turn",
  "roundIdx": 1,
  "state": "WAITING_PLAY",
  "text": "El ancho de espada es la carta mas fuerte. Usarlo asegura esta ronda."
}
```

Then explain the actual result after both cards are played:

```json
{
  "trigger": "after_bot_action",
  "roundIdx": 1,
  "text": "{{roundResult}} Quien gana una ronda abre la siguiente."
}
```

## Writing Correct Lessons

Prefer result-aware copy:

- Before a move, teach the rule or suggestion.
- After both cards are down, use `{{roundResult}}`.
- After a command answer, you may explain that exact answer if `actionValue` proves it happened.

Avoid outcome claims in `after_human_action` when the human only opened a card round. At that point the bot may not have answered yet.

Bad:

```json
{
  "trigger": "after_human_action",
  "roundIdx": 1,
  "actionValue": "1e",
  "text": "Ganaste primera ronda."
}
```

Better:

```json
{
  "trigger": "after_human_action",
  "roundIdx": 1,
  "actionValue": "1e",
  "text": "Ahora falta la respuesta del Profe."
}
```

Best result explanation:

```json
{
  "trigger": "after_bot_action",
  "roundIdx": 1,
  "text": "{{roundResult}}"
}
```

## Scoring Copy

For a 9-point tutorial, teach the real match goal:

```text
El partido se gana llegando a 9 buenas. Primero llenas malas; despues empiezan buenas.
```

Do not say the match is won by reaching `9 puntos`. In Truco, the player fills malas first, then wins by reaching buenas.

## Message Length

Every tutorial message must be short: `text.length <= 120`.

Keep Spanish in the repo's current ASCII style:

- Use `Gano`, not `Ganó`.
- Use `despues`, not `después`.
- Use `mas`, not `más`.

## Checklist For Editing A Tutorial

Before committing a tutorial change:

1. Confirm who opens each hand.
2. Confirm who opens each later round after the previous round result.
3. Replace card outcome guesses with `{{roundResult}}`.
4. Scope messages with `state`, `roundIdx`, and `actionValue` when needed.
5. Keep each message under 120 characters.
6. Make sure lesson text still makes sense if the player ignores the suggested card.
7. In `roundIdx: 3`, assume the player has one card left; do not tell them to choose the best card.
8. Parse the JSON and run the tutorial validation/tests.

Useful checks:

```sh
./node_modules/.bin/tsc --noEmit --project .
npm test -- --grep "Tutorial scenarios"
```
