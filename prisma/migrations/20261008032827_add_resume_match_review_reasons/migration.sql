-- AlterTable
ALTER TABLE "ResumeMatch" ADD COLUMN     "reviewReasons" TEXT[] DEFAULT ARRAY[]::TEXT[];
