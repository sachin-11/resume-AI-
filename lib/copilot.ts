/**
 * AI Interview Copilot — mock practice: classify speech → RAG + LLM answer (no TTS on server)
 */

import { callGroq } from "@/lib/groq";
import { retrieveRelevantChunks } from "@/lib/rag";
import { db } from "@/lib/db";
import { stripHtml } from "@/lib/utils";

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = codeBlock ? codeBlock[1]!.trim() : trimmed;
  try {
    return JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const CLASSIFIER_SYSTEM = `You are a filter for a MOCK INTERVIEW PRACTICE copilot. Transcripts are from noisy live speech.
Return ONLY a JSON object (no markdown, no backticks):
{
  "isQuestion": boolean,
  "relevant": boolean,
  "cleanedQuestion": string | null
}

Rules:
- isQuestion: true if this is (or contains) a clear question the user could answer in a job interview (behavioral, technical, system design, HR, salary, notice period, etc.), including implied questions.
- relevant: true only for substantive interview content — not chit-chat ("how's the weather"), not only "hi/hello/thanks/okay/next", not "can you hear me" unless there is also a real question, not pure filler.
- cleanedQuestion: one concise question the candidate should answer. If the speaker asked multiple things, use the most recent complete question. null if isQuestion is false. Max 500 characters.

JSON only.`;

export async function classifyTranscript(
  text: string
): Promise<{ isQuestion: boolean; relevant: boolean; cleanedQuestion: string | null }> {
  const clean = stripHtml(text).trim().slice(0, 2000);
  if (clean.length < 8) {
    return { isQuestion: false, relevant: false, cleanedQuestion: null };
  }

  // Use fastest Groq model for classification
  const Groq = (await import("groq-sdk")).default;
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  let out = "";
  try {
    const res = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant", // fastest model
      messages: [
        { role: "system", content: CLASSIFIER_SYSTEM },
        { role: "user", content: `Transcript:\n${clean}` },
      ],
      max_tokens: 120,
      temperature: 0,
    });
    out = res.choices[0]?.message?.content ?? "";
  } catch {
    // fallback — assume it's a question
    return { isQuestion: true, relevant: true, cleanedQuestion: clean.slice(0, 500) };
  }

  const j = parseJsonObject(out);
  if (!j) {
    return { isQuestion: true, relevant: true, cleanedQuestion: clean.slice(0, 500) };
  }

  let cleaned =
    typeof j.cleanedQuestion === "string" ? j.cleanedQuestion.trim().slice(0, 500) : null;

  const isQuestion = Boolean(j.isQuestion);
  const relevant = Boolean(j.relevant);

  if (isQuestion && relevant && !cleaned) {
    cleaned = clean.slice(0, 500);
  }

  return { isQuestion, relevant, cleanedQuestion: cleaned || null };
}

function buildAnswerSystemPrompt(resumeBlock: string): string {
  return `You are a concise interview coach. The user is doing MOCK / PERSONAL PRACTICE only.
Write a short answer they could speak aloud in 30–90 seconds.
- If resume or RAG context is present, stay truthful to it; do not invent companies, years, or titles.
- If there is no resume context, give a strong generic structure they can adapt.
- Plain text. Short paragraphs. Optional lines starting with "- " for bullets.
- No title line like "Answer:". Start with the first sentence of the response.
- No markdown # headings.

${resumeBlock ? `RESUME / CONTEXT:\n${resumeBlock}` : "No resume text was found — provide a solid generic response they can customize."}`;
}

export async function generateCopilotAnswer(userId: string, question: string): Promise<string> {
  const q = stripHtml(question).trim().slice(0, 2000);
  const chunks = await retrieveRelevantChunks(q, userId, 6);

  let block = "";
  if (chunks.length) {
    block = chunks.map((c, i) => `[${i + 1}] ${c}`).join("\n\n");
  } else {
    const res = await db.resume.findFirst({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      select: { rawText: true },
    });
    if (res?.rawText) {
      block = res.rawText.replace(/\s+/g, " ").trim().slice(0, 6000);
    }
  }

  return callGroq(buildAnswerSystemPrompt(block), `Interview question:\n${q}`);
}

export type CopilotProcessResult =
  | { action: "skip"; reason: string }
  | { action: "answer"; question: string; answer: string };

export type ProcessCopilotOptions = {
  /**
   * `true` (default): jo tum bolte ho use seedha "question" maan ke turant answer — classifier skip, ek hi LLM call.
   * `false` ("smart"): pehle check kare ki interview-jaisa sawaal hai; warna skip (zyaada cost + latency).
   */
  direct?: boolean;
};

export async function processCopilotTranscript(
  userId: string,
  text: string,
  options: ProcessCopilotOptions = {}
): Promise<CopilotProcessResult> {
  const clean = stripHtml(text).trim().slice(0, 2000);
  if (clean.length < 8) return { action: "skip", reason: "too_short" };

  const direct = options.direct !== false;

  if (direct) {
    const answer = await generateCopilotAnswer(userId, clean);
    const displayQ = clean.length > 320 ? `${clean.slice(0, 320)}…` : clean;
    return {
      action: "answer",
      question: displayQ,
      answer: answer.trim(),
    };
  }

  const classification = await classifyTranscript(clean);
  if (!classification.isQuestion || !classification.relevant) {
    return { action: "skip", reason: "not_a_question" };
  }
  const q = classification.cleanedQuestion ?? clean.slice(0, 200);
  const answer = await generateCopilotAnswer(userId, q);
  return {
    action: "answer",
    question: q,
    answer: answer.trim(),
  };
}
