-- AlterTable
ALTER TABLE "Sprint" ADD COLUMN     "confluenceExportedAt" TIMESTAMP(3),
ADD COLUMN     "confluencePageId" TEXT,
ADD COLUMN     "confluenceUrl" TEXT;
