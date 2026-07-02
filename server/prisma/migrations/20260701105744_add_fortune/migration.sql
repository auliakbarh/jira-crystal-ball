-- CreateTable
CREATE TABLE "FortuneDraft" (
    "id" TEXT NOT NULL,
    "squadId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "requirementText" TEXT,
    "turns" TEXT,
    "usage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FortuneDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FortuneHistory" (
    "id" TEXT NOT NULL,
    "squadId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "jiraKey" TEXT,
    "payload" TEXT,
    "turns" TEXT,
    "usage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FortuneHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FortuneDraft_squadId_updatedAt_idx" ON "FortuneDraft"("squadId", "updatedAt");

-- CreateIndex
CREATE INDEX "FortuneHistory_squadId_createdAt_idx" ON "FortuneHistory"("squadId", "createdAt");

-- AddForeignKey
ALTER TABLE "FortuneDraft" ADD CONSTRAINT "FortuneDraft_squadId_fkey" FOREIGN KEY ("squadId") REFERENCES "Squad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FortuneHistory" ADD CONSTRAINT "FortuneHistory_squadId_fkey" FOREIGN KEY ("squadId") REFERENCES "Squad"("id") ON DELETE CASCADE ON UPDATE CASCADE;
