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

function getIndex() {
  const indexName = process.env.PINECONE_INDEX ?? "resume-coach";
  return getPinecone().index(indexName);
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
 * Pseudo-embedding: 384-dim vector from text statistics
 * Not semantic but consistent — good enough for demo/fallback
 */
function pseudoEmbed(text: string): number[] {
  const dim = 384;
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
    console.error("[RAG] Index error:", err);
    // Non-blocking — don't fail the upload
  }
}

// ── RETRIEVE: Get relevant chunks for a query ───────────────────
export async function retrieveRelevantChunks(
  query: string,
  userId: string,
  topK = 5
): Promise<string[]> {
  if (!process.env.PINECONE_API_KEY) return [];

  try {
    const index = getIndex();
    const queryEmbedding = await getEmbedding(query);

    const results = await index.query({
      vector: queryEmbedding,
      topK,
      filter: { userId },
      includeMetadata: true,
    });

    return results.matches
      ?.filter((m) => (m.score ?? 0) > 0.3)
      .map((m) => (m.metadata?.text as string) ?? "")
      .filter(Boolean) ?? [];
  } catch (err) {
    console.error("[RAG] Retrieve error:", err);
    return [];
  }
}

// ── DELETE: Remove resume vectors ───────────────────────────────
export async function deleteResumeVectors(resumeId: string): Promise<void> {
  if (!process.env.PINECONE_API_KEY) return;

  try {
    const index = getIndex();
    // Delete all vectors whose metadata.resumeId matches
    await index.deleteMany({ filter: { resumeId } });
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
