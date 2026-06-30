-- CreateEnum
CREATE TYPE "Position" AS ENUM ('FE', 'BE', 'QA', 'PM');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('CUTI', 'SAKIT', 'IZIN');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Squad" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultBoardId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Squad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StandupSession" (
    "id" TEXT NOT NULL,
    "sprintId" TEXT NOT NULL,
    "leadName" TEXT NOT NULL,
    "leadKey" TEXT NOT NULL,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StandupSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StandupLog" (
    "id" TEXT NOT NULL,
    "squadId" TEXT NOT NULL,
    "sprintId" TEXT,
    "leadName" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "durationSec" INTEGER NOT NULL,

    CONSTRAINT "StandupLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "squadId" TEXT NOT NULL,
    "sprintId" TEXT,
    "actor" TEXT NOT NULL,
    "ticketKey" TEXT,
    "message" TEXT NOT NULL,
    "prevText" TEXT,
    "newText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL,
    "squadId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" "Position" NOT NULL,
    "jiraAccountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Leave" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "type" "LeaveType" NOT NULL DEFAULT 'CUTI',
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "substituteId" TEXT,
    "note" TEXT,

    CONSTRAINT "Leave_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "squadId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sprint" (
    "id" TEXT NOT NULL,
    "squadId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StandupEntry" (
    "id" TEXT NOT NULL,
    "sprintId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "ticketKey" TEXT NOT NULL,
    "ticketStatus" TEXT,
    "ticketSummary" TEXT,
    "ticketAssignee" TEXT,
    "issueType" TEXT,
    "epicKey" TEXT,
    "epicName" TEXT,
    "parentKey" TEXT,
    "parentName" TEXT,
    "carryOverCount" INTEGER,
    "carryOverFrom" TEXT,
    "feAssignee" TEXT,
    "beAssignee" TEXT,
    "qaAssignee" TEXT,
    "feProgress" INTEGER NOT NULL DEFAULT 0,
    "beProgress" INTEGER NOT NULL DEFAULT 0,
    "qaProgress" INTEGER NOT NULL DEFAULT 0,
    "updateText" TEXT DEFAULT '',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "blockerNote" TEXT DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StandupEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Blocker" (
    "id" TEXT NOT NULL,
    "squadId" TEXT NOT NULL,
    "sprintId" TEXT,
    "description" TEXT NOT NULL,
    "jiraTicket" TEXT,
    "foundDate" DATE NOT NULL,
    "resolvedDate" DATE,
    "note" TEXT,
    "resolveNote" TEXT,
    "sourceEntryId" TEXT,

    CONSTRAINT "Blocker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Squad_name_key" ON "Squad"("name");

-- CreateIndex
CREATE UNIQUE INDEX "StandupSession_sprintId_key" ON "StandupSession"("sprintId");

-- CreateIndex
CREATE INDEX "StandupLog_squadId_startedAt_idx" ON "StandupLog"("squadId", "startedAt");

-- CreateIndex
CREATE INDEX "ActivityLog_squadId_createdAt_idx" ON "ActivityLog"("squadId", "createdAt");

-- CreateIndex
CREATE INDEX "TeamMember_squadId_idx" ON "TeamMember"("squadId");

-- CreateIndex
CREATE INDEX "Leave_memberId_idx" ON "Leave"("memberId");

-- CreateIndex
CREATE INDEX "Holiday_squadId_idx" ON "Holiday"("squadId");

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_squadId_date_key" ON "Holiday"("squadId", "date");

-- CreateIndex
CREATE INDEX "Sprint_squadId_idx" ON "Sprint"("squadId");

-- CreateIndex
CREATE UNIQUE INDEX "Sprint_squadId_number_key" ON "Sprint"("squadId", "number");

-- CreateIndex
CREATE INDEX "StandupEntry_sprintId_date_idx" ON "StandupEntry"("sprintId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "StandupEntry_sprintId_date_ticketKey_key" ON "StandupEntry"("sprintId", "date", "ticketKey");

-- CreateIndex
CREATE UNIQUE INDEX "Blocker_sourceEntryId_key" ON "Blocker"("sourceEntryId");

-- CreateIndex
CREATE INDEX "Blocker_squadId_idx" ON "Blocker"("squadId");

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_squadId_fkey" FOREIGN KEY ("squadId") REFERENCES "Squad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_squadId_fkey" FOREIGN KEY ("squadId") REFERENCES "Squad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Leave" ADD CONSTRAINT "Leave_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Leave" ADD CONSTRAINT "Leave_substituteId_fkey" FOREIGN KEY ("substituteId") REFERENCES "TeamMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holiday" ADD CONSTRAINT "Holiday_squadId_fkey" FOREIGN KEY ("squadId") REFERENCES "Squad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sprint" ADD CONSTRAINT "Sprint_squadId_fkey" FOREIGN KEY ("squadId") REFERENCES "Squad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandupEntry" ADD CONSTRAINT "StandupEntry_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "Sprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Blocker" ADD CONSTRAINT "Blocker_squadId_fkey" FOREIGN KEY ("squadId") REFERENCES "Squad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Blocker" ADD CONSTRAINT "Blocker_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "Sprint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

