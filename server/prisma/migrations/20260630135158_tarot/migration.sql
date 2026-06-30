-- CreateEnum
CREATE TYPE "TarotRoomStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "TarotRoundStatus" AS ENUM ('VOTING', 'REVEALED', 'DECIDED');

-- CreateEnum
CREATE TYPE "TarotScaleType" AS ENUM ('FIBONACCI', 'SCRUM', 'CUSTOM');

-- AlterTable
ALTER TABLE "Squad" ADD COLUMN     "tarotScaleType" "TarotScaleType",
ADD COLUMN     "tarotScaleValues" TEXT;

-- CreateTable
CREATE TABLE "TarotRoom" (
    "id" TEXT NOT NULL,
    "squadId" TEXT NOT NULL,
    "hostName" TEXT NOT NULL,
    "hostKey" TEXT NOT NULL,
    "status" "TarotRoomStatus" NOT NULL DEFAULT 'ACTIVE',
    "scaleType" "TarotScaleType" NOT NULL DEFAULT 'FIBONACCI',
    "scaleValues" TEXT NOT NULL,
    "currentRoundId" TEXT,
    "sprintName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "TarotRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TarotParticipant" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "isHost" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "kicked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TarotParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TarotRound" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "ticketKey" TEXT NOT NULL,
    "ticketSummary" TEXT,
    "ticketType" TEXT,
    "ticketPriority" TEXT,
    "ticketUrl" TEXT,
    "status" "TarotRoundStatus" NOT NULL DEFAULT 'VOTING',
    "cycle" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TarotRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TarotVote" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "participantName" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TarotVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TarotResult" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "ticketKey" TEXT NOT NULL,
    "ticketSummary" TEXT,
    "effort" DOUBLE PRECISION NOT NULL,
    "pointFE" DOUBLE PRECISION,
    "pointBE" DOUBLE PRECISION,
    "pointQA" DOUBLE PRECISION,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "jiraPrevValues" TEXT,
    "syncedAt" TIMESTAMP(3),

    CONSTRAINT "TarotResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TarotRoom_squadId_status_idx" ON "TarotRoom"("squadId", "status");

-- CreateIndex
CREATE INDEX "TarotParticipant_roomId_idx" ON "TarotParticipant"("roomId");

-- CreateIndex
CREATE UNIQUE INDEX "TarotParticipant_roomId_key_key" ON "TarotParticipant"("roomId", "key");

-- CreateIndex
CREATE INDEX "TarotRound_roomId_ticketKey_idx" ON "TarotRound"("roomId", "ticketKey");

-- CreateIndex
CREATE INDEX "TarotVote_roundId_idx" ON "TarotVote"("roundId");

-- CreateIndex
CREATE UNIQUE INDEX "TarotVote_roundId_participantId_key" ON "TarotVote"("roundId", "participantId");

-- CreateIndex
CREATE INDEX "TarotResult_roomId_idx" ON "TarotResult"("roomId");

-- CreateIndex
CREATE UNIQUE INDEX "TarotResult_roomId_ticketKey_key" ON "TarotResult"("roomId", "ticketKey");

-- AddForeignKey
ALTER TABLE "TarotRoom" ADD CONSTRAINT "TarotRoom_squadId_fkey" FOREIGN KEY ("squadId") REFERENCES "Squad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TarotParticipant" ADD CONSTRAINT "TarotParticipant_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "TarotRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TarotRound" ADD CONSTRAINT "TarotRound_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "TarotRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TarotVote" ADD CONSTRAINT "TarotVote_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "TarotRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TarotVote" ADD CONSTRAINT "TarotVote_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "TarotParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TarotResult" ADD CONSTRAINT "TarotResult_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "TarotRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
