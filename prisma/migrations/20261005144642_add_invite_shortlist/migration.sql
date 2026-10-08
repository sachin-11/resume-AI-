-- AlterTable
ALTER TABLE "CandidateInvite" ADD COLUMN     "shortlistNote" TEXT,
ADD COLUMN     "shortlisted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shortlistedAt" TIMESTAMP(3);
