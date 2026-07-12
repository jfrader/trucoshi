# Skin rolls

The backend stores duplicate card skins as `UserCardSkin.quantity`. Existing
ownership rows are migrated with a quantity of one. New grants increment the
quantity instead of ignoring an already-owned skin.

## Rules

- A roll consumes exactly five owned copies.
- The five copies may be the same skin or different skins, but every skin must
  have the same rarity.
- The upgrade path is `COMMON` → `RARE` → `EPIC` → `LEGENDARY`.
- `LEGENDARY` and `PROMO` skins cannot be used as roll inputs.
- The reward is selected uniformly from enabled, unlockable skins at the next
  rarity.
- If the last copy of an equipped skin is consumed, that card is unequipped.
- Consumption, reward grant, and roll history are committed in one database
  transaction. Guarded quantity updates prevent concurrent double-spending.

Every completed roll creates a `UserSkinRoll` audit row containing the account,
input/output rarities, the five consumed skin IDs, and the rewarded skin ID.

## Socket contract

Clients emit `ROLL_CARD_SKINS` with an array of exactly five skin IDs and a
callback:

```ts
socket.emit(
  EClientEvent.ROLL_CARD_SKINS,
  [skinId, skinId, skinId, skinId, skinId],
  (response) => {}
)
```

A successful callback includes `rollResult`, the refreshed `inventory`, and the
refreshed `equippedDeck`. Inventory skin entries expose `quantity`; locked skins
have quantity zero.

The `rollResult` includes the audit `rollId`, input and output rarities, the
consumed IDs, and full metadata for the rewarded skin.
