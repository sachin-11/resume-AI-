-- CreateTable
CREATE TABLE "AutoApplyJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resumeId" TEXT,
    "jobTitle" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "location" TEXT,
    "jobUrl" TEXT,
    "jobDescription" TEXT NOT NULL,
    "salary" TEXT,
    "jobType" TEXT,
    "source" TEXT NOT NULL DEFAULT 'jsearch',
    "externalId" TEXT,
    "matchScore" INTEGER,
    "matchedSkills" TEXT[],
    "missingSkills" TEXT[],
    "coverLetter" TEXT,
    "hrEmail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'found',
    "appliedAt" TIMESTAMP(3),
    "emailSentAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoApplyJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoApplySettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resumeId" TEXT,
    "targetRole" TEXT NOT NULL,
    "location" TEXT NOT NULL DEFAULT 'India',
    "minMatchScore" INTEGER NOT NULL DEFAULT 65,
    "autoEmailEnabled" BOOLEAN NOT NULL DEFAULT false,
    "companyName" TEXT NOT NULL DEFAULT 'Candidate',
    "dailyLimit" INTEGER NOT NULL DEFAULT 10,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoApplySettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutoApplyJob_userId_idx" ON "AutoApplyJob"("userId");

-- CreateIndex
CREATE INDEX "AutoApplyJob_userId_status_idx" ON "AutoApplyJob"("userId", "status");

-- CreateIndex
CREATE INDEX "AutoApplyJob_userId_createdAt_idx" ON "AutoApplyJob"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AutoApplySettings_userId_key" ON "AutoApplySettings"("userId");

-- AddForeignKey
ALTER TABLE "AutoApplyJob" ADD CONSTRAINT "AutoApplyJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoApplySettings" ADD CONSTRAINT "AutoApplySettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
