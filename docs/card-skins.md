# Card skin registry

This repository owns skin metadata and user inventory behavior. The sibling
`trucoshi-client` repository owns source, print, and web image files.

After building and publishing a release in `../trucoshi-client`, add any new
web assets to the registry:

```sh
yarn sync:skins argentino --rarity COMMON
```

The command reads
`../trucoshi-client/src/generated/cards/releases/<release>/` by default. It
adds missing definitions to `src/cosmetics/skins.json` and never stores
`assetPath`; runtime code derives that path as
`web/releases/<release>/<fileName>`. That value is a stable logical API path;
the client resolves it from its generated card module rather than using it as a
filesystem path.

Review every new definition and change `rarity` where appropriate. Valid values
are `COMMON`, `RARE`, `EPIC`, `LEGENDARY`, and `PROMO`.

Check one release without changing JSON:

```sh
yarn sync:skins argentino --check
```

The check fails for missing files, unregistered files, invalid card/filename
pairs, duplicate IDs, invalid rarities, or persisted `assetPath` fields.

Skin IDs have the permanent form:

```text
<release>/<card>_<release>_<three-digit variation>
```

Once users may own an ID, do not rename or reuse it. Publish a new variation
number for replacement artwork.

Adding definitions does not change the Prisma schema and requires no migration.
`InventoryService.seedInitialCardSkins()` inserts or updates configured skins
when the server starts.

Duplicate ownership and rarity upgrades are documented in
[`skin-rolls.md`](./skin-rolls.md).
