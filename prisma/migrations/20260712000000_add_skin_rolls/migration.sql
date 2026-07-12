-- Keep duplicate copies on the existing ownership row.
ALTER TABLE "UserCardSkin"
ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "UserCardSkin"
ADD CONSTRAINT "UserCardSkin_quantity_check" CHECK ("quantity" >= 0);

-- Immutable roll history for support, balancing, and abuse investigations.
CREATE TABLE "UserSkinRoll" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "inputRarity" "CardSkinRarity" NOT NULL,
    "outputRarity" "CardSkinRarity" NOT NULL,
    "consumedSkinIds" JSONB NOT NULL,
    "rewardedSkinId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSkinRoll_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserSkinRoll_accountId_idx" ON "UserSkinRoll"("accountId");
CREATE INDEX "UserSkinRoll_createdAt_idx" ON "UserSkinRoll"("createdAt");

ALTER TABLE "UserSkinRoll"
ADD CONSTRAINT "UserSkinRoll_rewardedSkinId_fkey"
FOREIGN KEY ("rewardedSkinId") REFERENCES "CardSkin"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
