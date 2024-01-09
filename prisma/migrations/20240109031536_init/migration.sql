-- CreateEnum
CREATE TYPE "EMatchState" AS ENUM ('UNREADY', 'READY', 'STARTED', 'FINISHED');

-- CreateTable
CREATE TABLE "UserStats" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER,
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
    "sessionId" TEXT NOT NULL,
    "state" "EMatchState" NOT NULL DEFAULT 'UNREADY',
    "ownerAccountId" INTEGER,
    "options" JSONB NOT NULL DEFAULT '{}',
    "results" JSONB NOT NULL DEFAULT '[{"buenas": 0,"malas": 0 },{ "buenas": 0,"malas": 0 }]',

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
    "idx" INTEGER NOT NULL,
    "rounds" JSONB NOT NULL DEFAULT '[[]]',
    "results" JSONB NOT NULL DEFAULT '[0, 0]',
    "matchId" INTEGER NOT NULL,
    "trucoWinnerIdx" INTEGER NOT NULL,
    "envidoWinnerIdx" INTEGER,
    "florWinnerIdx" INTEGER,

    CONSTRAINT "MatchHand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchPlayer" (
    "id" SERIAL NOT NULL,
    "idx" INTEGER NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Satoshi',
    "accountId" INTEGER,
    "teamIdx" INTEGER NOT NULL,
    "satsPaid" INTEGER NOT NULL DEFAULT 0,
    "satsReceived" INTEGER NOT NULL DEFAULT 0,
    "payRequestId" INTEGER,
    "matchId" INTEGER NOT NULL,

    CONSTRAINT "MatchPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserStats_accountId_key" ON "UserStats"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchBet_matchId_key" ON "MatchBet"("matchId");

-- AddForeignKey
ALTER TABLE "MatchBet" ADD CONSTRAINT "MatchBet_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchHand" ADD CONSTRAINT "MatchHand_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchPlayer" ADD CONSTRAINT "MatchPlayer_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
