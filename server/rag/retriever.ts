import { getServerConfig } from '../config/env.js';
import { db } from '../db/database.js';
import { embedSingleQueryCached, RetrievedChunkForPrompt } from '../services/gemini.js';

function cosineSimilarity(a: Float32Array, bBuffer: Buffer): number {
  if (!bBuffer || bBuffer.byteLength === 0) return 0;
  const b = new Float32Array(bBuffer.buffer, bBuffer.byteOffset, bBuffer.byteLength / 4);
  if (a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

const STOPWORDS = new Set([
  'what', 'when', 'where', 'which', 'who', 'how', 'is', 'are', 'the', 'a', 'an',
  'in', 'on', 'for', 'to', 'of', 'and', 'or', 'with', 'do', 'does', 'need', 'i',
  'my', 'we', 'can', 'should', 'about', 'pakistan', 'pakistani', 'business',
]);

function buildFtsQuery(rawQuery: string): string {
  const tokens = rawQuery
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));

  if (tokens.length === 0) {
    return rawQuery
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 2)
      .slice(0, 6)
      .join(' OR ');
  }
  return tokens.slice(0, 10).map((t) => `${t}*`).join(' OR ');
}

export async function retrieveRelevantChunks(params: {
  query: string;
  topK?: number;
  authorityCode?: string;
  includeSuperseded?: boolean;
  onlyVerifiedOfficial?: boolean;
}): Promise<{ chunks: RetrievedChunkForPrompt[]; retrievalMode: 'hybrid_vector_fts' | 'lexical_fts' }> {
  const topK = params.topK ?? 8;
  const activeEmbeddingModel = getServerConfig().embeddingModel;
  const whereClauses = [`d.status IN ('published', 'superseded', 'conflict_review')`];
  const sqlParams: any[] = [];

  if (!params.includeSuperseded) {
    // Allow superseded records when relevant, sorted below current rules unless explicitly queried
  }
  if (params.onlyVerifiedOfficial !== false) {
    whereClauses.push(`d.verification_status = 'verified_official'`);
  }
  if (params.authorityCode) {
    whereClauses.push(`a.code = ?`);
    sqlParams.push(params.authorityCode.toUpperCase());
  }

  const allCandidateRows = db
    .prepare(
      `SELECT dc.id as chunk_id, dc.document_id, dc.chunk_text, dc.page_number, dc.section_title,
              dc.embedding, dc.embedding_dim, dc.embedding_model,
              d.title as document_title, d.source_url, d.document_type, d.publication_date,
              d.effective_date, d.version, d.is_superseded, d.verification_status, d.status,
              COALESCE(a.name, 'General Authority') as authority_name
       FROM document_chunks dc
       JOIN documents d ON d.id = dc.document_id
       LEFT JOIN authorities a ON a.id = d.authority_id
       WHERE ${whereClauses.join(' AND ')}`
    )
    .all(...sqlParams) as any[];

  if (allCandidateRows.length === 0) {
    return { chunks: [], retrievalMode: 'lexical_fts' };
  }

  // 1. FTS5 Lexical BM25 scores
  const ftsScores = new Map<number, number>();
  const ftsQuery = buildFtsQuery(params.query);
  if (ftsQuery) {
    try {
      const ftsRows = db
        .prepare(
          `SELECT rowid as chunk_id, bm25(chunks_fts) as rank
           FROM chunks_fts
           WHERE chunks_fts MATCH ?
           ORDER BY rank
           LIMIT 40`
        )
        .all(ftsQuery) as any[];
      ftsRows.forEach((r, idx) => {
        ftsScores.set(r.chunk_id, 1 / (idx + 1) + Math.min(1, Math.abs(r.rank) / 15));
      });
    } catch {
      // Fallback to substring matching below if FTS syntax rejects a query
    }
  }

  // 2. Vector similarity ONLY against chunks indexed with the active embedding_model (never mix models)
  const hasCompatibleVectors = allCandidateRows.some(
    (r) =>
      r.embedding_dim > 0 &&
      r.embedding &&
      (!r.embedding_model || r.embedding_model === activeEmbeddingModel)
  );
  let queryVec: Float32Array | null = null;
  if (hasCompatibleVectors) {
    queryVec = await embedSingleQueryCached(params.query);
  }

  const queryTerms = params.query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));

  let matchedVectorChunkCount = 0;

  const scored = allCandidateRows.map((row) => {
    const modelCompatible = !row.embedding_model || row.embedding_model === activeEmbeddingModel;
    const dimCompatible = queryVec && row.embedding_dim === queryVec.length;
    const vecSim =
      queryVec && row.embedding && modelCompatible && dimCompatible
        ? cosineSimilarity(queryVec, row.embedding)
        : 0;
    if (vecSim !== 0) matchedVectorChunkCount += 1;

    const ftsScore = ftsScores.get(row.chunk_id) || 0;

    // Exact keyword / title boost
    const hay = `${row.document_title} ${row.section_title} ${row.chunk_text}`.toLowerCase();
    let keywordHits = 0;
    for (const term of queryTerms) {
      if (hay.includes(term)) keywordHits += 1;
    }
    const keywordScore = queryTerms.length > 0 ? keywordHits / queryTerms.length : 0;

    // Penalize superseded documents unless query explicitly mentions legacy term
    const mentionsLegacy = /form\s*29|old\s+form|previous|repealed|superseded/i.test(params.query);
    const supersededPenalty = row.is_superseded && !mentionsLegacy ? -0.18 : 0;

    const combined =
      (vecSim > 0 ? vecSim * 0.58 : 0) +
      ftsScore * 0.28 +
      keywordScore * 0.35 +
      supersededPenalty;

    return {
      chunk_id: row.chunk_id,
      document_id: row.document_id,
      document_title: row.document_title,
      authority_name: row.authority_name,
      source_url: row.source_url,
      document_type: row.document_type,
      publication_date: row.publication_date || '',
      effective_date: row.effective_date || '',
      version: row.version || '1.0',
      is_superseded: Boolean(row.is_superseded),
      verification_status: row.verification_status,
      page_number: row.page_number,
      section_title: row.section_title,
      chunk_text: row.chunk_text,
      score: Number(combined.toFixed(4)),
    };
  });

  scored.sort((a, b) => b.score - a.score);

  const filtered = scored.filter((c) => c.score > 0.08).slice(0, topK);

  return {
    chunks: filtered,
    retrievalMode: matchedVectorChunkCount > 0 ? 'hybrid_vector_fts' : 'lexical_fts',
  };
}
