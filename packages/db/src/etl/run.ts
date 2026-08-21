import { randomUUID } from "node:crypto";
import { getDb } from "../db";
import { getDbConfig } from "../config";
import { embedTexts } from "./embeddings";
import { loadStaging } from "./load";

export type EmbedFn = (texts: string[]) => Promise<number[][]>;

export type EtlResult = {
  documentId: string;
  chunks: number;
  entities: number;
  relations: number;
  chunkIds: string[];
};

function vecLiteral(vector?: number[]): string | null {
  if (!vector || vector.length === 0) return null;
  return `[${vector.join(",")}]`;
}

/**
 * Copies a LightRAG staging workspace into the graphatlas runtime schema.
 * Idempotent: chunks are replaced per document; entities/relations upsert
 * and merge source_chunk_ids. Embeddings are computed with the same model.
 */
export async function runEtl(
  workspaceDir: string,
  documentId: string,
  opts: { embed?: EmbedFn } = {},
): Promise<EtlResult> {
  const embed = opts.embed ?? embedTexts;
  const sql = getDb();
  const data = loadStaging(workspaceDir);
  const model = process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";
  const dim = getDbConfig().embeddingDimensions;

  const chunkTexts = data.chunks.map((c) => c.content);
  const entityTexts = data.entities.map((e) => `${e.name}\n${e.description}`);
  const relationTexts = data.relations.map(
    (r) => `${r.keywords}\t${r.srcId}\n${r.tgtId}\n${r.description}`,
  );
  const [chunkVecs, entityVecs, relationVecs] = await Promise.all([
    embed(chunkTexts),
    embed(entityTexts),
    embed(relationTexts),
  ]);

  await sql.begin(async (tx) => {
    await tx`DELETE FROM graphatlas.chunks WHERE document_id = ${documentId}`;

    for (const [i, c] of data.chunks.entries()) {
      // LightRAG chunk ids are content-addressed (md5 of the file), so the same
      // content ingested twice yields identical staging ids. Namespace with the
      // document id to keep the runtime PK unique across documents.
      const runtimeChunkId = `${documentId}:${c.id}`;
      await tx`
        INSERT INTO graphatlas.chunks (id, document_id, chunk_index, text, embedding, embedding_model, embedding_dim)
        VALUES (${runtimeChunkId}, ${documentId}, ${i}, ${c.content}, ${vecLiteral(chunkVecs[i])}::vector, ${model}, ${dim})
      `;
    }

    for (const [i, e] of data.entities.entries()) {
      const existing = await tx<{ source_chunk_ids: string[] }[]>`
        SELECT source_chunk_ids FROM graphatlas.entities WHERE id = ${e.name}
      `;
      const merged = Array.from(new Set([...(existing[0]?.source_chunk_ids ?? []), ...e.chunkIds]));
      await tx`
        INSERT INTO graphatlas.entities (id, name, entity_type, description, source_chunk_ids, embedding, embedding_model, embedding_dim)
        VALUES (${e.name}, ${e.name}, 'UNKNOWN', ${e.description}, ${tx.json(merged)}, ${vecLiteral(entityVecs[i])}::vector, ${model}, ${dim})
        ON CONFLICT (id) DO UPDATE SET
          description = EXCLUDED.description,
          source_chunk_ids = EXCLUDED.source_chunk_ids,
          embedding = EXCLUDED.embedding,
          embedding_model = EXCLUDED.embedding_model,
          embedding_dim = EXCLUDED.embedding_dim
      `;
    }

    for (const [i, r] of data.relations.entries()) {
      const existing = await tx<{ source_chunk_ids: string[] }[]>`
        SELECT source_chunk_ids FROM graphatlas.relations WHERE src_id = ${r.srcId} AND tgt_id = ${r.tgtId}
      `;
      const merged = Array.from(new Set([...(existing[0]?.source_chunk_ids ?? []), ...r.chunkIds]));
      await tx`
        INSERT INTO graphatlas.relations (id, src_id, tgt_id, keywords, description, weight, source_chunk_ids, embedding, embedding_model, embedding_dim)
        VALUES (${randomUUID()}, ${r.srcId}, ${r.tgtId}, ${r.keywords}, ${r.description}, 1.0, ${tx.json(merged)}, ${vecLiteral(relationVecs[i])}::vector, ${model}, ${dim})
        ON CONFLICT (src_id, tgt_id) DO UPDATE SET
          keywords = EXCLUDED.keywords,
          description = EXCLUDED.description,
          weight = EXCLUDED.weight,
          source_chunk_ids = EXCLUDED.source_chunk_ids,
          embedding = EXCLUDED.embedding,
          embedding_model = EXCLUDED.embedding_model,
          embedding_dim = EXCLUDED.embedding_dim
      `;
    }
  });

  await sql`
    UPDATE graphatlas.documents SET status = 'ready', updated_at = now() WHERE id = ${documentId}
  `;

  return {
    documentId,
    chunks: data.chunks.length,
    entities: data.entities.length,
    relations: data.relations.length,
    chunkIds: data.chunks.map((c) => `${documentId}:${c.id}`),
  };
}
