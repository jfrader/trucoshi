-- CreateEnum
CREATE TYPE "CardSkinRarity" AS ENUM ('COMMON', 'RARE', 'EPIC', 'LEGENDARY', 'PROMO');

-- AlterTable
ALTER TABLE "MatchPlayer" ADD COLUMN "deckSkinByCard" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "CardSkin" (
    "id" TEXT NOT NULL,
    "release" TEXT NOT NULL,
    "card" TEXT NOT NULL,
    "description" TEXT,
    "fileName" TEXT NOT NULL,
    "assetPath" TEXT NOT NULL,
    "rarity" "CardSkinRarity" NOT NULL DEFAULT 'COMMON',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "unlockable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardSkin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCardSkin" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "cardSkinId" TEXT NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT,

    CONSTRAINT "UserCardSkin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserDeckCard" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "card" TEXT NOT NULL,
    "cardSkinId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserDeckCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CardSkin_release_idx" ON "CardSkin"("release");

-- CreateIndex
CREATE INDEX "CardSkin_card_idx" ON "CardSkin"("card");

-- CreateIndex
CREATE INDEX "CardSkin_enabled_idx" ON "CardSkin"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "UserCardSkin_accountId_cardSkinId_key" ON "UserCardSkin"("accountId", "cardSkinId");

-- CreateIndex
CREATE INDEX "UserCardSkin_accountId_idx" ON "UserCardSkin"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "UserDeckCard_accountId_card_key" ON "UserDeckCard"("accountId", "card");

-- CreateIndex
CREATE INDEX "UserDeckCard_accountId_idx" ON "UserDeckCard"("accountId");

-- AddForeignKey
ALTER TABLE "UserCardSkin" ADD CONSTRAINT "UserCardSkin_cardSkinId_fkey" FOREIGN KEY ("cardSkinId") REFERENCES "CardSkin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDeckCard" ADD CONSTRAINT "UserDeckCard_cardSkinId_fkey" FOREIGN KEY ("cardSkinId") REFERENCES "CardSkin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
