import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { closeDb, getDb } from "../src/db";
import { insertDocument } from "../src/repo/documents";
import { migrate } from "../src/migrate";
import { keywordRecall } from "@graphatlas/core";

const TAG = randomUUID().slice(0, 8);
const CHUNK_SEARCH = `doc-${TAG}-000`;
const CHUNK_BILLING = `doc-${TAG}-001`;
let docId = "";

beforeAll(async () => {
  await migrate();
  const doc = await insertDocument({ title: "Retrieval fixture", kind: "md", fileType: "text/markdown" });
  docId = doc.id;
  const sql = getDb();
  await sql`
    INSERT INTO graphatlas.chunks (id, document_id, chunk_index, text, embedding_model, embedding_dim)
    VALUES (${CHUNK_SEARCH}, ${docId}, 0, 'Aurora Dynamics builds enterprise search tools.', 'test', 1536)
  `;
  await sql`
    INSERT INTO graphatlas.chunks (id, document_id, chunk_index, text, embedding_model, embedding_dim)
    VALUES (${CHUNK_BILLING}, ${docId}, 1, 'Finance handles billing and invoices.', 'test', 1536)
  `;
  await sql`UPDATE graphatlas.documents SET status = 'ready' WHERE id = ${docId}`;
});

describe("keyword recall", () => {
  test("lexical path ranks the chunk containing the query word", async () => {
    const sql = getDb();
    const results = await keywordRecall(sql, "search", { limit: 5 });
    const hit = results.find((r) => r.chunkId === CHUNK_SEARCH);
    expect(hit).toBeDefined();
    expect(hit!.matchTypes).toContain("keyword");
    expect(hit!.rawScores.keyword).toBeGreaterThan(0);
  });

  test("literal path matches an exact phrase", async () => {
    const sql = getDb();
    const results = await keywordRecall(sql, "search tools", { limit: 5 });
    const hit = results.find((r) => r.chunkId === CHUNK_SEARCH);
    expect(hit).toBeDefined();
    expect(hit!.matchTypes).toContain("literal");
  });

  test("different query matches the other chunk", async () => {
    const sql = getDb();
    const results = await keywordRecall(sql, "billing", { limit: 5 });
    const hit = results.find((r) => r.chunkId === CHUNK_BILLING);
    expect(hit).toBeDefined();
  });
});

afterAll(async () => {
  const sql = getDb();
  await sql`DELETE FROM graphatlas.chunks WHERE document_id = ${docId}`;
  await sql`DELETE FROM graphatlas.documents WHERE id = ${docId}`;
  await closeDb();
});
