-- AlterTable
ALTER TABLE "InterviewSession" ADD COLUMN     "cameraEverEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "faceDetectionActive" BOOLEAN NOT NULL DEFAULT false;
