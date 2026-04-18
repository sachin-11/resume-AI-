-- Add indexes for frequently queried fields
CREATE INDEX IF NOT EXISTS "InterviewSession_userId_idx" ON "InterviewSession"("userId");
CREATE INDEX IF NOT EXISTS "InterviewSession_userId_status_idx" ON "InterviewSession"("userId", "status");
CREATE INDEX IF NOT EXISTS "InterviewSession_userId_createdAt_idx" ON "InterviewSession"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "FeedbackReport_sessionId_idx" ON "FeedbackReport"("sessionId");
