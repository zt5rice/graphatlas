import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { closeDb, getDb } from "../src/db";
import { insertDocument } from "../src/repo/documents";
import { migrate } from "../src/migrate";
import { vectorRecall } from "@graphatlas/core";

const DIM = 1536;
const TAG = randomUUID().slice(0, 8);
const MODEL = "test";
const ENTITY_ID = `VecEntity-${TAG}`;
const RELATION_ID = `VecRel-${TAG}`;
let docId = "";
let chunkId = "";

function oneHot(index: number): number[] {
  return Array.from({ length: DIM }, (_, i) => (i === index ? 1 : 0));
}

function vecLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}

beforeAll(async () => {
  await migrate();
  const doc = await insertDocument({ title: "Vector fixture", kind: "md", fileType: "text/markdown" });
  docId = doc.id;
  chunkId = `doc-${TAG}-000`;
  const sql = getDb();
  await sql`
    INSERT INTO graphatlas.chunks (id, document_id, chunk_index, text, embedding, embedding_model, embedding_dim)
    VALUES (${chunkId}, ${docId}, 0, 'Vector search match text.', ${vecLiteral(oneHot(0))}::vector, ${MODEL}, ${DIM})
  `;
  await sql`UPDATE graphatlas.documents SET status = 'ready' WHERE id = ${docId}`;
  await sql`
    INSERT INTO graphatlas.entities (id, name, entity_type, description, source_chunk_ids, embedding, embedding_model, embedding_dim)
    VALUES (${ENTITY_ID}, ${ENTITY_ID}, 'TEST', 'Vector match entity.', '[]'::jsonb, ${vecLiteral(oneHot(0))}::vector, ${MODEL}, ${DIM})
  `;
  await sql`
    INSERT INTO graphatlas.relations (id, src_id, tgt_id, keywords, description, weight, source_chunk_ids, embedding, embedding_model, embedding_dim)
    VALUES (${RELATION_ID}, ${ENTITY_ID}, ${ENTITY_ID}, 'match', 'Vector match relation.', 1.0, '[]'::jsonb, ${vecLiteral(oneHot(0))}::vector, ${MODEL}, ${DIM})
  `;
});

describe("vector recall", () => {
  test("returns the expected top entity for a matching query vector", async () => {
    const sql = getDb();
    const result = await vectorRecall(
      sql,
      async () => oneHot(0),
      "some query",
      { limit: 5, model: MODEL, dim: DIM },
    );
    expect(result.entities.length).toBeGreaterThan(0);
    expect(result.entities[0]!.name).toBe(ENTITY_ID);
    expect(result.entities[0]!.score).toBeGreaterThan(0.9);
  });

  test("returns matching chunk and relation hits", async () => {
    const sql = getDb();
    const result = await vectorRecall(sql, async () => oneHot(0), "some query", {
      limit: 5,
      model: MODEL,
      dim: DIM,
    });
    const chunkHit = result.chunks.find((c) => c.chunkId === chunkId);
    expect(chunkHit).toBeDefined();
    expect(chunkHit!.rawScores["vector:chunk"]).toBeGreaterThan(0.9);
    const relHit = result.relations.find((r) => r.id === RELATION_ID);
    expect(relHit).toBeDefined();
  });

  test("model/dim guard excludes rows from a different model", async () => {
    const sql = getDb();
    const result = await vectorRecall(sql, async () => oneHot(0), "some query", {
      limit: 5,
      model: "other-model",
      dim: DIM,
    });
    expect(result.entities.find((e) => e.name === ENTITY_ID)).toBeUndefined();
  });
});

afterAll(async () => {
  const sql = getDb();
  await sql`DELETE FROM graphatlas.relations WHERE id = ${RELATION_ID}`;
  await sql`DELETE FROM graphatlas.entities WHERE id = ${ENTITY_ID}`;
  await sql`DELETE FROM graphatlas.chunks WHERE document_id = ${docId}`;
  await sql`DELETE FROM graphatlas.documents WHERE id = ${docId}`;
  await closeDb();
});
