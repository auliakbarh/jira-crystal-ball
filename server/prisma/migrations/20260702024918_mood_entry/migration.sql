-- CreateTable
CREATE TABLE "MoodEntry" (
    "id" TEXT NOT NULL,
    "sprintId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "memberName" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "mood" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MoodEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MoodEntry_sprintId_date_idx" ON "MoodEntry"("sprintId", "date");

-- CreateIndex
CREATE INDEX "MoodEntry_memberId_idx" ON "MoodEntry"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "MoodEntry_sprintId_memberId_date_key" ON "MoodEntry"("sprintId", "memberId", "date");

-- AddForeignKey
ALTER TABLE "MoodEntry" ADD CONSTRAINT "MoodEntry_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "Sprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoodEntry" ADD CONSTRAINT "MoodEntry_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
