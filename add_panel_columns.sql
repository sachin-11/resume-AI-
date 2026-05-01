-- Add panel interview columns to InterviewSession
ALTER TABLE "InterviewSession"
  ADD COLUMN IF NOT EXISTS "panelInterview" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "pairProgramming" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "adaptiveCheckpointDone" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "adaptiveAdjustment" TEXT,
  ADD COLUMN IF NOT EXISTS "adaptiveNote" TEXT;

-- Add panel agent columns to Question
ALTER TABLE "Question"
  ADD COLUMN IF NOT EXISTS "panelAgent" TEXT,
  ADD COLUMN IF NOT EXISTS "starterCode" TEXT,
  ADD COLUMN IF NOT EXISTS "codeLanguage" TEXT;

-- Add quality/confidence scores to Answer
ALTER TABLE "Answer"
  ADD COLUMN IF NOT EXISTS "qualityScore" INTEGER,
  ADD COLUMN IF NOT EXISTS "confidenceScore" INTEGER;
