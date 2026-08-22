import type { Sql } from "postgres";
import type { RecallCandidate } from "./types";
import { compactQuery, snippet } from "./snippet";

export type KeywordRecallOptions = {
  limit: number;
  candidateLimit?: number;
  documentIds?: string[];
};

type KeywordRow = {
  chunk_id: string;
  document_id: string;
  text: string;
  score: number;
};

function escapeLike(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

/**
 * Keyword recall over ready documents:
 *  - lexical: tsvector('simple') + plainto_tsquery + ts_rank
 *  - literal: ILIKE phrase, plus a compact (no-whitespace) fallback
 * Returns candidates with per-path rank/score ready for RRF fusion.
 */
export async function keywordRecall(
  sql: Sql,
  query: string,
  opts: KeywordRecallOptions,
): Promise<RecallCandidate[]> {
  const candidateLimit = opts.candidateLimit ?? Math.max(opts.limit * 5, 50);
  const documentIds = opts.documentIds ?? [];
  const candidates = new Map<string, RecallCandidate>();

  const add = (type: string, rows: KeywordRow[]) => {
    rows.forEach((row, index) => {
      const rank = index + 1;
      const score = Number(row.score) || 0;
      const existing = candidates.get(row.chunk_id);
      if (existing) {
        existing.ranks[type] = rank;
        existing.rawScores[type] = score;
        existing.matchTypes.push(type);
        return;
      }
      candidates.set(row.chunk_id, {
        chunkId: row.chunk_id,
        documentId: row.document_id,
        text: row.text,
        snippet: snippet(row.text, query),
        matchTypes: [type],
        ranks: { [type]: rank },
        rawScores: { [type]: score },
      });
    });
  };

  const lexical = await sql<KeywordRow[]>`
    WITH keyword_query AS (
      SELECT plainto_tsquery('simple', ${query}) AS tsq
    )
    SELECT c.id AS chunk_id, c.document_id, c.text,
           ts_rank(c.text_search, keyword_query.tsq)::float8 AS score
    FROM graphatlas.chunks c
    JOIN graphatlas.documents d ON d.id = c.document_id
    CROSS JOIN keyword_query
    WHERE d.status = 'ready'
      AND c.text_search @@ keyword_query.tsq
      AND (${documentIds.length} = 0 OR c.document_id = ANY(${documentIds}))
    ORDER BY score DESC, c.created_at DESC
    LIMIT ${candidateLimit}
  `;
  add("keyword", lexical);

  const phrasePattern = `%${escapeLike(query.trim())}%`;
  const compactPattern = `%${escapeLike(compactQuery(query))}%`;
  const literal = await sql<KeywordRow[]>`
    SELECT c.id AS chunk_id, c.document_id, c.text,
           GREATEST(
             CASE WHEN c.text ILIKE ${phrasePattern} ESCAPE '\\' THEN 1.0 ELSE 0.0 END,
             CASE WHEN c.text ILIKE ${compactPattern} ESCAPE '\\' THEN 0.95 ELSE 0.0 END
           )::float8 AS score
    FROM graphatlas.chunks c
    JOIN graphatlas.documents d ON d.id = c.document_id
    WHERE d.status = 'ready'
      AND (c.text ILIKE ${phrasePattern} ESCAPE '\\' OR c.text ILIKE ${compactPattern} ESCAPE '\\')
      AND (${documentIds.length} = 0 OR c.document_id = ANY(${documentIds}))
    ORDER BY score DESC, c.created_at DESC
    LIMIT ${candidateLimit}
  `;
  add("literal", literal);

  return [...candidates.values()].sort((a, b) => {
    const typeDiff = b.matchTypes.length - a.matchTypes.length;
    if (typeDiff !== 0) return typeDiff;
    return Math.min(...Object.values(a.ranks)) - Math.min(...Object.values(b.ranks));
  });
}
