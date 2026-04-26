/**
 * RAG (Retrieval Augmented Generation) Pipeline
 *
 * Flow:
 * 1. INDEXING  — Resume text → chunks → embeddings → Pinecone
 * 2. RETRIEVAL — Query (role + context) → embedding → Pinecone similarity search → top-k chunks
 * 3. GENERATION — Retrieved chunks + prompt → Groq LLM → better output
 */

import { Pinecone } from "@pinecone-database/pinecone";
import Groq from "groq-sdk";

// ── Pinecone client (lazy) ───────────────────────────────────────
let _pc: Pinecone | null = null;
function getPinecone(): Pinecone {
  if (!_pc) {
    if (!process.env.PINECONE_API_KEY) throw new Error("PINECONE_API_KEY not set");
    _pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
  }
  return _pc;
}

export function getPineconeIndexName(): string {
  return process.env.PINECONE_INDEX ?? "resume-coach";
}

/** If Pinecone returns 404 (index missing / wrong name), skip further calls this process — avoids log spam. */
let pineconeIndexUnavailable = false;

function getIndex() {
  return getPinecone().index(getPineconeIndexName());
}

function isPineconeIndexMissingError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  if (/\b404\b|not found|UnknownIndex|does not exist|INDEX.*NOT.*FOUND/i.test(msg)) return true;
  if (err && typeof err === "object" && "status" in err) {
    const s = (err as { status?: number }).status;
    if (s === 404) return true;
  }
  return false;
}

// ── Groq embedding (using llama text-embedding model) ───────────
// Groq doesn't have embeddings yet — use a simple TF-IDF-like hash
// OR use OpenAI embeddings if available, else fallback to Groq chat for semantic similarity
async function getEmbedding(text: string): Promise<number[]> {
  // Try OpenAI embeddings first (best quality)
  if (process.env.OPENAI_API_KEY) {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({ model: "text-embedding-3-small", input: text.slice(0, 8000) }),
    });
    const data = await res.json();
    if (data.data?.[0]?.embedding) return data.data[0].embedding;
  }

  // Fallback: deterministic pseudo-embedding using character frequency
  // (Not semantic, but works for basic similarity without external API)
  return pseudoEmbed(text);
}

/**
 * Pseudo-embedding: dim must match the Pinecone index (OpenAI `text-embedding-3-small` = 1536 by default).
 * If you only ever use pseudo, create the index with the same dim or set PINECONE_PSEUDO_DIM=384, etc.
 */
function pseudoEmbed(text: string): number[] {
  const dim = Number(process.env.PINECONE_PSEUDO_DIM) || 1536;
  const vec = new Array(dim).fill(0);
  const words = text.toLowerCase().split(/\W+/).filter(Boolean);

  for (const word of words) {
    let hash = 5381;
    for (let i = 0; i < word.length; i++) {
      hash = ((hash << 5) + hash) ^ word.charCodeAt(i);
      hash = hash & hash; // 32-bit
    }
    const idx = Math.abs(hash) % dim;
    vec[idx] += 1;
  }

  // L2 normalize
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

// ── Text chunking ────────────────────────────────────────────────
export function chunkText(text: string, chunkSize = 500, overlap = 100): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let i = 0;

  while (i < words.length) {
    const chunk = words.slice(i, i + chunkSize).join(" ");
    if (chunk.trim()) chunks.push(chunk.trim());
    i += chunkSize - overlap;
  }

  return chunks;
}

// ── INDEX: Store resume in Pinecone ─────────────────────────────
export async function indexResume(resumeId: string, userId: string, resumeText: string): Promise<void> {
  if (!process.env.PINECONE_API_KEY) return; // Skip if not configured
  if (pineconeIndexUnavailable) return;

  try {
    const index = getIndex();
    const chunks = chunkText(resumeText);

    const vectors = await Promise.all(
      chunks.map(async (chunk, i) => {
        const embedding = await getEmbedding(chunk);
        return {
          id: `${resumeId}_chunk_${i}`,
          values: embedding,
          metadata: {
            resumeId,
            userId,
            chunkIndex: i,
            text: chunk.slice(0, 1000), // Pinecone metadata limit
          },
        };
      })
    );

    // Upsert in batches of 100
    for (let i = 0; i < vectors.length; i += 100) {
      await index.upsert({ records: vectors.slice(i, i + 100) });
    }

    console.log(`[RAG] Indexed ${vectors.length} chunks for resume ${resumeId}`);
  } catch (err) {
    if (isPineconeIndexMissingError(err)) {
      pineconeIndexUnavailable = true;
      console.warn(
        `[RAG] Index "${getPineconeIndexName()}" not found in Pinecone — vectors not saved. ` +
          `Create an index (or set PINECONE_INDEX) in https://app.pinecone.io/ then restart the app.`
      );
    } else {
      console.error("[RAG] Index error:", err);
    }
  }
}

// ── RETRIEVE: Get relevant chunks for a query ───────────────────
export async function retrieveRelevantChunks(
  query: string,
  userId: string,
  topK = 5
): Promise<string[]> {
  if (!process.env.PINECONE_API_KEY) return [];
  if (pineconeIndexUnavailable) return [];

  try {
    const index = getIndex();
    const queryEmbedding = await getEmbedding(query);

    const results = await index.query({
      vector: queryEmbedding,
      topK,
      // Serverless + newer APIs: explicit $eq (plain { userId } can fail in some projects)
      filter: { userId: { $eq: userId } },
      includeMetadata: true,
    });

    return results.matches
      ?.filter((m) => (m.score ?? 0) > 0.3)
      .map((m) => (m.metadata?.text as string) ?? "")
      .filter(Boolean) ?? [];
  } catch (err) {
    if (isPineconeIndexMissingError(err)) {
      pineconeIndexUnavailable = true;
      console.warn(
        `[RAG] Pinecone index "${getPineconeIndexName()}" not found (404). ` +
          `Create it in the Pinecone console (same name as PINECONE_INDEX) or fix your API key’s project. ` +
          `Copilot still answers using your latest resume in the database; RAG adds smarter snippets after the index exists (restart the app then).`
      );
    } else {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        "[RAG] Retrieve error:",
        msg,
        "— check dimension (OPENAI 1536 vs PINECONE_PSEUDO_DIM) and metadata userId on vectors."
      );
    }
    return [];
  }
}

// ── DELETE: Remove resume vectors ───────────────────────────────
export async function deleteResumeVectors(resumeId: string): Promise<void> {
  if (!process.env.PINECONE_API_KEY) return;
  if (pineconeIndexUnavailable) return;

  try {
    const index = getIndex();
    // Delete all vectors whose metadata.resumeId matches
    await index.deleteMany({ filter: { resumeId: { $eq: resumeId } } });
  } catch (err) {
    console.error("[RAG] Delete error:", err);
  }
}

// ── RAG-ENHANCED question generation context ────────────────────
export async function buildRAGContext(
  userId: string,
  role: string,
  roundType: string
): Promise<string> {
  const query = `${role} ${roundType} interview questions skills experience`;
  const chunks = await retrieveRelevantChunks(query, userId, 5);

  if (chunks.length === 0) return "";

  return `
CANDIDATE RESUME CONTEXT (retrieved via semantic search):
${chunks.map((c, i) => `[Chunk ${i + 1}]: ${c}`).join("\n\n")}

Use the above resume context to generate highly personalized questions that reference specific:
- Projects, technologies, and tools mentioned
- Job titles, companies, and responsibilities
- Achievements and metrics
- Skills and certifications
`.trim();
}

// ── RAG-ENHANCED feedback context ───────────────────────────────
export async function buildFeedbackRAGContext(
  userId: string,
  role: string,
  answers: Array<{ question: string; answer: string }>
): Promise<string> {
  // Build query from all answers combined
  const query = answers.map((a) => a.answer).join(" ").slice(0, 1000);
  const chunks = await retrieveRelevantChunks(query, userId, 3);

  if (chunks.length === 0) return "";

  return `
CANDIDATE'S RESUME BACKGROUND (for context-aware feedback):
${chunks.map((c) => c).join("\n\n")}

When evaluating answers, consider the candidate's actual background from their resume.
Give credit for answers that align with their real experience.
`.trim();
}
