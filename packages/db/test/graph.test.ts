import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { closeDb, getDb } from "../src/db";
import { insertDocument } from "../src/repo/documents";
import { migrate } from "../src/migrate";
import { graphRecall } from "@graphatlas/core";

const TAG = randomUUID().slice(0, 8);
const A = `GraphA-${TAG}`;
const B = `GraphB-${TAG}`;
const C = `GraphC-${TAG}`;
const D = `GraphD-${TAG}`;
let docId = "";
let chunkA = "";

async function insertEntity(id: string, chunkIds: string[]) {
  const sql = getDb();
  const description = `entity ${id}`;
  await sql`
    INSERT INTO graphatlas.entities (id, name, entity_type, description, source_chunk_ids, embedding_model, embedding_dim)
    VALUES (${id}, ${id}, 'TEST', ${description}, ${sql.json(chunkIds)}, 'test', 1536)
  `;
}

async function insertRelation(src: string, tgt: string, chunkIds: string[]) {
  const sql = getDb();
  const description = `relation ${src} to ${tgt}`;
  await sql`
    INSERT INTO graphatlas.relations (id, src_id, tgt_id, keywords, description, weight, source_chunk_ids, embedding_model, embedding_dim)
    VALUES (${`${src}|${tgt}`}, ${src}, ${tgt}, 'rel', ${description}, 1.0, ${sql.json(chunkIds)}, 'test', 1536)
  `;
}

beforeAll(async () => {
  await migrate();
  const doc = await insertDocument({ title: "Graph fixture", kind: "md", fileType: "text/markdown" });
  docId = doc.id;
  chunkA = `doc-${TAG}-000`;
  const sql = getDb();
  await sql`
    INSERT INTO graphatlas.chunks (id, document_id, chunk_index, text, embedding_model, embedding_dim)
    VALUES (${chunkA}, ${docId}, 0, 'Graph fixture chunk.', 'test', 1536)
  `;
  await sql`UPDATE graphatlas.documents SET status = 'ready' WHERE id = ${docId}`;

  await insertEntity(A, [chunkA]);
  await insertEntity(B, []);
  await insertEntity(C, []);
  await insertEntity(D, []);
  await insertRelation(A, B, [chunkA]);
  await insertRelation(B, C, []);
  await insertRelation(C, A, []); // cycle
  await insertRelation(C, D, []);
});

describe("graph recall", () => {
  test("expands 2 hops from the seed entity", async () => {
    const sql = getDb();
    const result = await graphRecall(sql, [A], { maxHop: 2 });
    expect(result.seeds).toEqual([A]);
    const names = result.entities.map((e) => e.name).sort();
    expect(names).toEqual([A, B, C, D].sort());
    const relKeys = result.relations.map((r) => `${r.srcId}|${r.tgtId}`).sort();
    expect(relKeys).toEqual([`${A}|${B}`, `${B}|${C}`, `${C}|${A}`, `${C}|${D}`].sort());
    expect(result.chunkIds).toContain(chunkA);
  });

  test("1 hop only reaches direct neighbors (B via A-B, C via cycle edge)", async () => {
    const sql = getDb();
    const result = await graphRecall(sql, [A], { maxHop: 1 });
    expect(result.entities.map((e) => e.name).sort()).toEqual([A, B, C].sort());
  });

  test("empty seeds return an empty result", async () => {
    const sql = getDb();
    const result = await graphRecall(sql, [], { maxHop: 2 });
    expect(result.entities).toEqual([]);
    expect(result.relations).toEqual([]);
  });
});

afterAll(async () => {
  const sql = getDb();
  await sql`
    DELETE FROM graphatlas.relations
    WHERE src_id = ANY(${[A, B, C, D]}) OR tgt_id = ANY(${[A, B, C, D]})
  `;
  await sql`DELETE FROM graphatlas.entities WHERE id = ANY(${[A, B, C, D]})`;
  await sql`DELETE FROM graphatlas.chunks WHERE document_id = ${docId}`;
  await sql`DELETE FROM graphatlas.documents WHERE id = ${docId}`;
  await closeDb();
});
