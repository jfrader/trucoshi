-- CreateTable
CREATE TABLE "AdminRewardCode" (
    "id" SERIAL NOT NULL,
    "codeHash" TEXT NOT NULL,
    "codePreview" TEXT NOT NULL,
    "createdByAccountId" INTEGER NOT NULL,
    "intendedAccountId" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "redeemedAt" TIMESTAMP(3),
    "redeemedByAccountId" INTEGER,
    "treasureChestId" INTEGER,

    CONSTRAINT "AdminRewardCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminRewardCode_codeHash_key" ON "AdminRewardCode"("codeHash");

-- CreateIndex
CREATE UNIQUE INDEX "AdminRewardCode_treasureChestId_key" ON "AdminRewardCode"("treasureChestId");

-- CreateIndex
CREATE INDEX "AdminRewardCode_createdAt_idx" ON "AdminRewardCode"("createdAt");

-- CreateIndex
CREATE INDEX "AdminRewardCode_redeemedAt_idx" ON "AdminRewardCode"("redeemedAt");

-- CreateIndex
CREATE INDEX "AdminRewardCode_redeemedByAccountId_idx" ON "AdminRewardCode"("redeemedByAccountId");

-- AddForeignKey
ALTER TABLE "AdminRewardCode" ADD CONSTRAINT "AdminRewardCode_treasureChestId_fkey" FOREIGN KEY ("treasureChestId") REFERENCES "UserTreasureChest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
