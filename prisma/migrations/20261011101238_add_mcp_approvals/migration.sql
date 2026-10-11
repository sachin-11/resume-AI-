-- CreateTable
CREATE TABLE "McpApproval" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "outcome" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "McpApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "McpApproval_userId_status_idx" ON "McpApproval"("userId", "status");

-- CreateIndex
CREATE INDEX "McpApproval_candidateId_slotId_idx" ON "McpApproval"("candidateId", "slotId");
