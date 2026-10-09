"""
FAQ Answerer — Company Docs RAG store (Pinecone)

Reuses the same Pinecone index as `lib/rag.ts` (`PINECONE_INDEX`, default "resume"),
tagged with metadata `type: "policy_doc"` so it never collides with resume-chunk vectors.

Chunking, retrieval (top_k, min_score) and the embedding model are pinned per
environment in releases.json ("kb"), so they are versioned with the release.
Defaults mirror lib/rag.ts: 500-word chunks, 100-word overlap. Changing chunking
or the embedding model needs the policy docs re-ingested.
Embeddings: OpenAI `text-embedding-3-small` (1536-dim) if OPENAI_API_KEY is set,
else a deterministic hash-based pseudo-embedding — same safety-net idea as the TS side,
just not bit-identical (purely so Pinecone never breaks when no key is configured).
"""
import os
import math
from typing import List, Optional

from core.release import kb_config

_pc_client = None
_index = None


def _get_index():
    global _pc_client, _index
    if _index is not None:
        return _index
    api_key = os.getenv("PINECONE_API_KEY")
    if not api_key:
        return None
    from pinecone import Pinecone
    _pc_client = Pinecone(api_key=api_key)
    index_name = os.getenv("PINECONE_INDEX", "resume")
    _index = _pc_client.Index(index_name)
    return _index


def _chunk_text(text: str, chunk_words: Optional[int] = None, overlap_words: Optional[int] = None) -> List[str]:
    kb = kb_config()
    chunk_words = chunk_words or kb["chunk_words"]
    overlap_words = kb["overlap_words"] if overlap_words is None else overlap_words
    words = text.split()
    if not words:
        return []
    chunks = []
    step = max(1, chunk_words - overlap_words)
    for start in range(0, len(words), step):
        chunk = words[start:start + chunk_words]
        if not chunk:
            break
        chunks.append(" ".join(chunk))
        if start + chunk_words >= len(words):
            break
    return chunks


def _hash_embedding(text: str, dim: int = 1536) -> List[float]:
    vector = [0.0] * dim
    for word in text.lower().split():
        h = 5381
        for ch in word:
            h = ((h * 33) + ord(ch)) & 0xFFFFFFFF
        vector[h % dim] += 1.0
    norm = math.sqrt(sum(v * v for v in vector)) or 1.0
    return [v / norm for v in vector]


def _embed(text: str) -> List[float]:
    if os.getenv("OPENAI_API_KEY"):
        try:
            from langchain_openai import OpenAIEmbeddings
            embedder = OpenAIEmbeddings(model=kb_config()["embedding_model"], api_key=os.getenv("OPENAI_API_KEY"))
            return embedder.embed_query(text)
        except Exception:
            pass
    return _hash_embedding(text)


async def ingest_policy_doc(doc_id: str, title: str, text: str) -> dict:
    """Chunk + embed + upsert a company policy/FAQ doc into Pinecone."""
    index = _get_index()
    if index is None:
        return {"success": False, "chunksIndexed": 0, "message": "PINECONE_API_KEY not configured"}

    chunks = _chunk_text(text)
    if not chunks:
        return {"success": False, "chunksIndexed": 0, "message": "Document text is empty"}

    vectors = [
        {
            "id": f"policydoc:{doc_id}:{i}",
            "values": _embed(chunk),
            "metadata": {
                "type": "policy_doc",
                "docId": doc_id,
                "title": title,
                "chunkIndex": i,
                "text": chunk[:1000],
            },
        }
        for i, chunk in enumerate(chunks)
    ]

    for batch_start in range(0, len(vectors), 100):
        index.upsert(vectors=vectors[batch_start:batch_start + 100])

    return {"success": True, "chunksIndexed": len(vectors)}


def retrieve_policy_chunks_sync(query: str, top_k: Optional[int] = None, min_score: Optional[float] = None) -> List[dict]:
    """Embed the query, retrieve top-k policy-doc chunks, filter by similarity score.

    Blocking (embedding + Pinecone clients) — agents reach it through the
    `policy_docs.search` tool, which runs it in a worker thread.
    """
    index = _get_index()
    if index is None:
        return []

    kb = kb_config()
    top_k = top_k or kb["top_k"]
    min_score = kb["min_score"] if min_score is None else min_score
    query_vec = _embed(query)
    result = index.query(
        vector=query_vec,
        top_k=top_k,
        filter={"type": {"$eq": "policy_doc"}},
        include_metadata=True,
    )
    matches = result.get("matches", []) if isinstance(result, dict) else result.matches

    chunks = []
    for m in matches:
        score = m.get("score") if isinstance(m, dict) else m.score
        metadata = m.get("metadata") if isinstance(m, dict) else m.metadata
        if score is not None and score > min_score:
            chunks.append({
                "title": metadata.get("title", ""),
                "text": metadata.get("text", ""),
                "score": score,
            })
    return chunks
