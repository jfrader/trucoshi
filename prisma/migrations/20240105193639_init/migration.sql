-- CreateEnum
CREATE TYPE "EMatchState" AS ENUM ('UNREADY', 'READY', 'STARTED', 'FINISHED');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserStats" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "accountId" INTEGER NOT NULL,
    "win" INTEGER NOT NULL DEFAULT 0,
    "loss" INTEGER NOT NULL DEFAULT 0,
    "satsBet" INTEGER NOT NULL DEFAULT 0,
    "satsWon" INTEGER NOT NULL DEFAULT 0,
    "satsLost" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "UserStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" SERIAL NOT NULL,
    "state" "EMatchState" NOT NULL DEFAULT 'UNREADY',
    "ownerId" INTEGER NOT NULL,
    "ownerAccountId" INTEGER NOT NULL,
    "options" JSONB NOT NULL DEFAULT '{}',
    "results" JSONB NOT NULL DEFAULT '{ "0": { "buenas": 0, "malas": 0 },"1": { "buenas": 0, "malas": 0 } }',

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchBet" (
    "id" SERIAL NOT NULL,
    "matchId" INTEGER NOT NULL,
    "satsPerPlayer" INTEGER NOT NULL,
    "allPlayersPaid" BOOLEAN NOT NULL,
    "winnerAwarded" BOOLEAN NOT NULL,

    CONSTRAINT "MatchBet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchHand" (
    "id" SERIAL NOT NULL,
    "rounds" JSONB NOT NULL DEFAULT '[[], [], []]',
    "results" JSONB NOT NULL DEFAULT '{ "0": { "buenas": 0, "malas": 0 },"1": { "buenas": 0, "malas": 0 } }',
    "matchId" INTEGER NOT NULL,
    "winnerIdx" INTEGER NOT NULL,

    CONSTRAINT "MatchHand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchPlayer" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "accountId" INTEGER NOT NULL,
    "teamIdx" INTEGER NOT NULL,
    "satsPaid" INTEGER NOT NULL DEFAULT 0,
    "satsReceived" INTEGER NOT NULL DEFAULT 0,
    "payRequestId" INTEGER NOT NULL,
    "matchId" INTEGER NOT NULL,

    CONSTRAINT "MatchPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_accountId_key" ON "User"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "UserStats_userId_key" ON "UserStats"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserStats_accountId_key" ON "UserStats"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchBet_matchId_key" ON "MatchBet"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchPlayer_userId_key" ON "MatchPlayer"("userId");

-- AddForeignKey
ALTER TABLE "UserStats" ADD CONSTRAINT "UserStats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchBet" ADD CONSTRAINT "MatchBet_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchHand" ADD CONSTRAINT "MatchHand_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchPlayer" ADD CONSTRAINT "MatchPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchPlayer" ADD CONSTRAINT "MatchPlayer_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
