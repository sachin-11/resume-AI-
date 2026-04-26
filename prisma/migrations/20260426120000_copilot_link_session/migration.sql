-- CreateTable
CREATE TABLE "CopilotLinkSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinToken" TEXT NOT NULL,
    "lastTranscript" TEXT NOT NULL DEFAULT '',
    "lastSeq" INTEGER NOT NULL DEFAULT 0,
    "lastQuestion" TEXT,
    "lastAnswer" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CopilotLinkSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CopilotLinkSession_joinToken_key" ON "CopilotLinkSession"("joinToken");

-- CreateIndex
CREATE INDEX "CopilotLinkSession_userId_createdAt_idx" ON "CopilotLinkSession"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CopilotLinkSession_expiresAt_idx" ON "CopilotLinkSession"("expiresAt");

-- AddForeignKey
ALTER TABLE "CopilotLinkSession" ADD CONSTRAINT "CopilotLinkSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
