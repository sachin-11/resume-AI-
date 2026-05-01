-- AlterTable
ALTER TABLE "InterviewSession" ADD COLUMN     "adaptiveCheckpointDone" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "adaptiveAdjustment" TEXT,
ADD COLUMN     "adaptiveNote" TEXT;

-- AlterTable
ALTER TABLE "Answer" ADD COLUMN     "qualityScore" INTEGER,
ADD COLUMN     "confidenceScore" INTEGER;
