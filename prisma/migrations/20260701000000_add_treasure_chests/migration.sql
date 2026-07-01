-- AlterTable
ALTER TABLE "Match" ADD COLUMN "createdFromQueue" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "UserTreasureProgress" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserTreasureProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserTreasureMatchCredit" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "matchId" INTEGER NOT NULL,
    "creditedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserTreasureMatchCredit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserTreasureChest" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "sourceMatchId" INTEGER,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedAt" TIMESTAMP(3),
    "rolledRarity" "CardSkinRarity",
    "cardSkinId" TEXT,
    "duplicate" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "UserTreasureChest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserTreasureProgress_accountId_key" ON "UserTreasureProgress"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "UserTreasureMatchCredit_accountId_matchId_key" ON "UserTreasureMatchCredit"("accountId", "matchId");

-- CreateIndex
CREATE INDEX "UserTreasureMatchCredit_accountId_idx" ON "UserTreasureMatchCredit"("accountId");

-- CreateIndex
CREATE INDEX "UserTreasureMatchCredit_matchId_idx" ON "UserTreasureMatchCredit"("matchId");

-- CreateIndex
CREATE INDEX "UserTreasureChest_accountId_idx" ON "UserTreasureChest"("accountId");

-- CreateIndex
CREATE INDEX "UserTreasureChest_sourceMatchId_idx" ON "UserTreasureChest"("sourceMatchId");

-- CreateIndex
CREATE INDEX "UserTreasureChest_openedAt_idx" ON "UserTreasureChest"("openedAt");

-- AddForeignKey
ALTER TABLE "UserTreasureMatchCredit" ADD CONSTRAINT "UserTreasureMatchCredit_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTreasureChest" ADD CONSTRAINT "UserTreasureChest_sourceMatchId_fkey" FOREIGN KEY ("sourceMatchId") REFERENCES "Match"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTreasureChest" ADD CONSTRAINT "UserTreasureChest_cardSkinId_fkey" FOREIGN KEY ("cardSkinId") REFERENCES "CardSkin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
