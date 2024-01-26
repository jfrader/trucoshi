-- AlterTable
ALTER TABLE "MatchHand" ALTER COLUMN "clientSecrets" SET DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "secret" SET DEFAULT '';
