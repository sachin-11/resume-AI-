/**
 * POST /api/interview/code-review
 *
 * AI reviews candidate's code submission:
 * - Correctness
 * - Time/Space complexity
 * - Code quality & best practices
 * - Bugs & edge cases
 * - Improvement suggestions
 * - Score (0-100)
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { callGroq } from "@/lib/groq";
import { safeJsonParse } from "@/lib/utils";

const CODE_REVIEW_SYSTEM = `You are a senior software engineer conducting a technical interview at a top product company.
Review the candidate's code submission objectively and thoroughly.
Always respond with valid JSON only.`;

function codeReviewPrompt(question: string, code: string, language: string): string {
  return `Review this code submission for a technical interview question.

Question asked: "${question}"

Candidate's ${language} code:
\`\`\`${language}
${code.slice(0, 3000)}
\`\`\`

Return ONLY this JSON:
{
  "score": 78,
  "verdict": "good",
  "correctness": {
    "isCorrect": true,
    "issues": ["Edge case: empty array not handled", "Off-by-one error in loop"]
  },
  "complexity": {
    "time": "O(n log n)",
    "space": "O(n)",
    "isOptimal": false,
    "betterApproach": "Could be done in O(n) using a hash map"
  },
  "codeQuality": {
    "score": 75,
    "positives": ["Good variable naming", "Clean structure"],
    "issues": ["No error handling", "Magic numbers used", "Missing comments"]
  },
  "bugs": ["Line 5: index out of bounds when array is empty"],
  "improvements": [
    "Add input validation at the start",
    "Use const instead of let where value doesn't change",
    "Add a comment explaining the algorithm"
  ],
  "improvedCode": "// Improved version with fixes\\nfunction solution(arr) {\\n  if (!arr || arr.length === 0) return [];\\n  // ... rest of solution\\n}",
  "summary": "2-3 sentence overall assessment of the code"
}

verdict must be: "excellent" | "good" | "average" | "poor"
score: 0-100

Be specific — reference actual line numbers and variable names from their code.`;
}

function quickCodeCoachPrompt(question: string, code: string, language: string): string {
  return `You are pair-programming with a candidate in an interview. Give a VERY short live hint (not a full review).

Question context: "${question.slice(0, 400)}"

Their current ${language} code (may be incomplete):
\`\`\`${language}
${code.slice(0, 2500)}
\`\`\`

Return ONLY JSON:
{
  "progressScore": 55,
  "onTrack": true,
  "hint": "One concise sentence — what to fix or try next."
}

progressScore 0-100 = how close this looks to a reasonable direction (incomplete code OK).
onTrack = true if they are not wildly off-topic.`;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { question, code, language, questionId, sessionId, quick } = body;

  if (!code?.trim()) return NextResponse.json({ error: "No code provided" }, { status: 400 });
  if (!question) return NextResponse.json({ error: "Question required" }, { status: 400 });

  try {
    if (quick) {
      const raw = await callGroq(
        `Return only valid JSON. Be concise.`,
        quickCodeCoachPrompt(question, code, language ?? "javascript")
      );
      const quickReview = safeJsonParse(raw, {
        progressScore: 50,
        onTrack: true,
        hint: "Keep going — complete the TODO sections.",
      });
      return NextResponse.json({ quickReview });
    }

    const raw = await callGroq(CODE_REVIEW_SYSTEM, codeReviewPrompt(question, code, language ?? "javascript"));

    const review = safeJsonParse(raw, {
      score: 50, verdict: "average",
      correctness: { isCorrect: false, issues: [] },
      complexity: { time: "Unknown", space: "Unknown", isOptimal: false },
      codeQuality: { score: 50, positives: [], issues: [] },
      bugs: [], improvements: [], improvedCode: "", summary: "Review failed.",
    });

    return NextResponse.json({ review });
  } catch (err) {
    console.error("[CODE_REVIEW]", err);
    return NextResponse.json({ error: "Code review failed" }, { status: 500 });
  }
}
