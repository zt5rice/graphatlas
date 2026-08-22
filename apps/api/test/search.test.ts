import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { app } from "../src/app";
import { closeDb, getDb, migrate } from "@graphatlas/db";
import { searchDeps } from "../src/services/search";

const DIM = 1536;
const TAG = randomUUID().slice(0, 8);
const ENTITY = `SearchEntity-${TAG}`;
let docId = "";
let chunkSearch = "";
let chunkBilling = "";

function oneHot(index: number): number[] {
  return Array.from({ length: DIM }, (_, i) => (i === index ? 1 : 0));
}

function vecLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}

beforeAll(async () => {
  await migrate();
  process.env.EMBEDDING_MODEL = "test";
  process.env.EMBEDDING_DIMENSIONS = "1536";
  searchDeps.embed = async () => oneHot(0);
  const sql = getDb();
  const doc = await sql<{ id: string }[]>`
    INSERT INTO graphatlas.documents (title, kind, file_type, status)
    VALUES ('Search fixture', 'md', 'text/markdown', 'ready')
    RETURNING id
  `;
  docId = doc[0]!.id;
  chunkSearch = `doc-${TAG}-000`;
  chunkBilling = `doc-${TAG}-001`;
  await sql`
    INSERT INTO graphatlas.chunks (id, document_id, chunk_index, text, embedding, embedding_model, embedding_dim)
    VALUES (${chunkSearch}, ${docId}, 0, 'Aurora builds search tools.', ${vecLiteral(oneHot(0))}::vector, 'test', ${DIM})
  `;
  await sql`
    INSERT INTO graphatlas.chunks (id, document_id, chunk_index, text, embedding, embedding_model, embedding_dim)
    VALUES (${chunkBilling}, ${docId}, 1, 'Finance handles billing.', ${vecLiteral(oneHot(1))}::vector, 'test', ${DIM})
  `;
  await sql`
    INSERT INTO graphatlas.entities (id, name, entity_type, description, source_chunk_ids, embedding, embedding_model, embedding_dim)
    VALUES (${ENTITY}, ${ENTITY}, 'PRODUCT', 'Search product entity.', ${sql.json([chunkSearch])}, ${vecLiteral(oneHot(0))}::vector, 'test', ${DIM})
  `;
});

async function postSearch(body: Record<string, unknown>) {
  return app.request("/api/v1/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/search", () => {
  test("returns ranked results with evidence and diagnostics", async () => {
    const res = await postSearch({ query: "search", top_k: 5, document_ids: [docId] });
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      query: string;
      results: { chunk_id: string; score: number }[];
      diagnostics: { path: string; status: string }[];
      evidence: { entities: { name: string }[] };
      fusion: { method: string; k: number };
    };
    expect(data.query).toBe("search");
    expect(data.results.some((r) => r.chunk_id === chunkSearch)).toBe(true);
    expect(data.diagnostics.map((d) => d.path)).toEqual(["keyword", "vector", "graph"]);
    expect(data.diagnostics.every((d) => d.status === "ok" || d.status === "skipped")).toBe(true);
    expect(data.evidence.entities.some((e) => e.name === ENTITY)).toBe(true);
    expect(data.fusion).toEqual({ method: "rrf", k: 60 });
  });

  test("mode router resolves relationship questions to local", async () => {
    const res = await postSearch({ query: "Who does Ethan Brooks report to?", top_k: 5 });
    const data = (await res.json()) as { mode: string; mode_source: string };
    expect(data.mode).toBe("local");
    expect(data.mode_source).toBe("rule");
  });

  test("document_ids filter scopes the search", async () => {
    const res = await postSearch({ query: "search", top_k: 5, document_ids: [docId] });
    const data = (await res.json()) as { results: { chunk_id: string }[] };
    expect(data.results.some((r) => r.chunk_id === chunkSearch)).toBe(true);

    const other = await postSearch({ query: "search", top_k: 5, document_ids: ["00000000-0000-0000-0000-000000000000"] });
    expect(other.status).toBe(200);
    const otherData = (await other.json()) as { results: { chunk_id: string }[] };
    expect(otherData.results.some((r) => r.chunk_id === chunkSearch)).toBe(false);
  });

  test("validates input", async () => {
    expect((await postSearch({ query: "", top_k: 5 })).status).toBe(400);
    expect((await postSearch({ query: "ok", top_k: 0 })).status).toBe(400);
    expect((await postSearch({ query: "ok", top_k: 100 })).status).toBe(400);
  });
});

afterAll(async () => {
  delete process.env.EMBEDDING_MODEL;
  delete process.env.EMBEDDING_DIMENSIONS;
  const sql = getDb();
  await sql`DELETE FROM graphatlas.relations WHERE src_id = ${ENTITY} OR tgt_id = ${ENTITY}`;
  await sql`DELETE FROM graphatlas.entities WHERE id = ${ENTITY}`;
  await sql`DELETE FROM graphatlas.chunks WHERE document_id = ${docId}`;
  await sql`DELETE FROM graphatlas.documents WHERE id = ${docId}`;
  searchDeps.embed = undefined;
  await closeDb();
});
