-- CreateTable
CREATE TABLE "ExportLog" (
    "id" TEXT NOT NULL,
    "sprintId" TEXT NOT NULL,
    "squadId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExportLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExportLog_sprintId_createdAt_idx" ON "ExportLog"("sprintId", "createdAt");
