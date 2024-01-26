/*
  Warnings:

  - Added the required column `updatedAt` to the `Match` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `MatchBet` table without a default value. This is not possible if the table is not empty.
  - Added the required column `secret` to the `MatchHand` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `MatchHand` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `MatchPlayer` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "winnerIdx" INTEGER;

-- AlterTable
ALTER TABLE "MatchBet" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "MatchHand" ADD COLUMN     "clientSecrets" TEXT[],
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "secret" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "MatchPlayer" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;
