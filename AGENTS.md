# Trucoshi Agent Notes

## Pica-Pica Rules
- Pica-pica applies only to 6-player matches.
- Trigger: once any team reaches `ceil(matchPoint * PICA_PICA_TRIGGER_PERCENT)` (default `0.5`).
- Cadence: starts on the same eligible hand tick and alternates by tick (`pica`, `normal`, `pica`, ...).
- A pica tick is 3 real mini-hands with fixed opposite-seat pairs: `(0,3)`, `(1,4)`, `(2,5)`.
- Forehand/dealer rotation remains unchanged (normal `nextHand()` behavior).
- If any player is marked `abandoned`, pica-pica is permanently ended for that match.

## Bot Behavior
- During pica mini-hands, bot risk tolerance is reduced with `PICA_PICA_RISK_TOLERANCE_MULTIPLIER` (currently `0.65`).
- Detection: 6-player table with only 2 enabled players in the current mini-hand.

## Match Chat Announcements
- Once per match, at the first hand first playable turn: `Es el turno de X`.
- Once per match, when the first pica mini-hand starts: `Empezo el Pica-Pica`.
