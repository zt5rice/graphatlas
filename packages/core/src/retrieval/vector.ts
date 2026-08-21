import type { Sql } from "postgres";
import type { EntityHit, RecallCandidate, RelationHit, VectorRecallResult } from "./types";
import { snippet } from "./snippet";

export type VectorRecallOptions = {
  limit: number;
  candidateLimit?: number;
  model: string;
  dim: number;
};

export type QueryEmbedder = (text: string) => Promise<number[]>;

function similarity(dist: unknown): number {
  const d = Number(dist);
  return Number.isFinite(d) ? 1 / (1 + d) : 0;
}

/**
 * Dense vector recall over chunks, entities, and relations using pgvector
 * cosine distance (`<=>`, HNSW index). The embedding model/dimension guard
 * prevents comparing vectors from different models.
 */
export async function vectorRecall(
  sql: Sql,
  embedQuery: QueryEmbedder,
  query: string,
  opts: VectorRecallOptions,
): Promise<VectorRecallResult> {
  const vector = await embedQuery(query);
  const vec = `[${vector.join(",")}]`;
  const candidateLimit = opts.candidateLimit ?? Math.max(opts.limit * 3, 30);
  const model = opts.model;
  const dim = opts.dim;

  const chunkRows = await sql<{ chunk_id: string; document_id: string; text: string; dist: number }[]>`
    SELECT c.id AS chunk_id, c.document_id, c.text,
           (c.embedding <=> ${vec}::vector) AS dist
    FROM graphatlas.chunks c
    JOIN graphatlas.documents d ON d.id = c.document_id
    WHERE d.status = 'ready'
      AND c.embedding_model = ${model}
      AND c.embedding_dim = ${dim}
    ORDER BY c.embedding <=> ${vec}::vector ASC, c.created_at DESC
    LIMIT ${candidateLimit}
  `;
  const chunks: RecallCandidate[] = chunkRows.map((row, index) => ({
    chunkId: row.chunk_id,
    documentId: row.document_id,
    text: row.text,
    snippet: snippet(row.text, query),
    matchTypes: ["vector:chunk"],
    ranks: { "vector:chunk": index + 1 },
    rawScores: { "vector:chunk": similarity(row.dist) },
  }));

  const entityRows = await sql<{ id: string; name: string; dist: number }[]>`
    SELECT id, name, (embedding <=> ${vec}::vector) AS dist
    FROM graphatlas.entities
    WHERE embedding_model = ${model} AND embedding_dim = ${dim}
    ORDER BY embedding <=> ${vec}::vector ASC
    LIMIT ${candidateLimit}
  `;
  const entities: EntityHit[] = entityRows.map((row, index) => ({
    id: row.id,
    name: row.name,
    score: similarity(row.dist),
    rank: index + 1,
  }));

  const relationRows = await sql<{
    id: string;
    src_id: string;
    tgt_id: string;
    keywords: string;
    description: string;
    dist: number;
  }[]>`
    SELECT id, src_id, tgt_id, keywords, description, (embedding <=> ${vec}::vector) AS dist
    FROM graphatlas.relations
    WHERE embedding_model = ${model} AND embedding_dim = ${dim}
    ORDER BY embedding <=> ${vec}::vector ASC
    LIMIT ${candidateLimit}
  `;
  const relations: RelationHit[] = relationRows.map((row, index) => ({
    id: row.id,
    srcId: row.src_id,
    tgtId: row.tgt_id,
    keywords: row.keywords,
    description: row.description,
    score: similarity(row.dist),
    rank: index + 1,
  }));

  return { chunks, entities, relations };
}
