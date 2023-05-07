-- CreateEnum
CREATE TYPE "EMatchState" AS ENUM ('UNREADY', 'READY', 'STARTED', 'FINISHED');

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "Match" (
    "id" SERIAL NOT NULL,
    "state" "EMatchState" NOT NULL DEFAULT 'UNREADY',
    "ownerId" INTEGER NOT NULL,
    "hasBet" BOOLEAN NOT NULL,
    "maxPlayers" INTEGER NOT NULL,
    "faltaEnvido" INTEGER NOT NULL,
    "flor" BOOLEAN NOT NULL,
    "matchPoint" INTEGER NOT NULL,
    "handAckTime" INTEGER NOT NULL,
    "turnTime" INTEGER NOT NULL,
    "abandonTime" INTEGER NOT NULL,
    "latestHand" JSONB DEFAULT '[]',
    "results" JSONB NOT NULL DEFAULT '{ "0": { "buenas": 0, "malas": 0 },"1": { "buenas": 0, "malas": 0 } }',

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Match_ownerId_key" ON "Match"("ownerId");

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
