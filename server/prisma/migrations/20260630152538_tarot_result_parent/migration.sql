-- AlterTable
ALTER TABLE "TarotResult" ADD COLUMN     "parentKey" TEXT,
ADD COLUMN     "parentName" TEXT;

-- AlterTable
ALTER TABLE "TarotRound" ADD COLUMN     "parentKey" TEXT,
ADD COLUMN     "parentName" TEXT;
