-- AlterTable
ALTER TABLE "MatchHand" ADD COLUMN     "bitcoinHash" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "bitcoinHeight" INTEGER NOT NULL DEFAULT 0;
