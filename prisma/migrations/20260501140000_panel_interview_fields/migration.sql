-- AlterTable
ALTER TABLE "InterviewSession" ADD COLUMN     "panelInterview" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "InterviewSession" ADD COLUMN     "pairProgramming" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "panelAgent" TEXT;
ALTER TABLE "Question" ADD COLUMN     "starterCode" TEXT;
ALTER TABLE "Question" ADD COLUMN     "codeLanguage" TEXT;
