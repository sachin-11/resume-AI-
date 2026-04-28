-- CreateTable
CREATE TABLE IF NOT EXISTS "CandidateNote" (
    "id" TEXT NOT NULL,
    "inviteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CandidateNote_inviteId_idx" ON "CandidateNote"("inviteId");

-- AddForeignKey
ALTER TABLE "CandidateNote" ADD CONSTRAINT "CandidateNote_inviteId_fkey" FOREIGN KEY ("inviteId") REFERENCES "CandidateInvite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
