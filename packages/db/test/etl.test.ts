import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getDb, closeDb } from "../src/db";
import { insertDocument } from "../src/repo/documents";
import { runEtl } from "../src/etl/run";
import type { EmbedFn } from "../src/etl/run";

const DIM = 1536;
let fixtureDir: string;
let docId: string;

function fakeEmbed(): EmbedFn {
  return async (texts: string[]) => texts.map((_, i) => new Array(DIM).fill(0.001 * (i + 1)));
}

function writeStaging(dir: string) {
  writeFileSync(
    join(dir, "kv_store_text_chunks.json"),
    JSON.stringify({
      "doc-fake-000": { content: "Aurora Dynamics builds search tools." },
      "doc-fake-001": { content: "Ava Chen is the CEO of Aurora Dynamics." },
    }),
  );
  writeFileSync(
    join(dir, "vdb_entities.json"),
    JSON.stringify({
      data: [
        { entity_name: "Aurora Dynamics", content: "Aurora Dynamics\nAurora Dynamics builds search tools." },
        { entity_name: "Ava Chen", content: "Ava Chen\nAva Chen is the CEO of Aurora Dynamics." },
      ],
    }),
  );
  writeFileSync(
    join(dir, "kv_store_entity_chunks.json"),
    JSON.stringify({
      "Aurora Dynamics": { chunk_ids: ["doc-fake-000"] },
      "Ava Chen": { chunk_ids: ["doc-fake-001"] },
    }),
  );
  writeFileSync(
    join(dir, "vdb_relationships.json"),
    JSON.stringify({
      data: [
        {
          src_id: "Ava Chen",
          tgt_id: "Aurora Dynamics",
          content: "leads\tAva Chen\nAurora Dynamics\nAva Chen leads Aurora Dynamics.",
        },
      ],
    }),
  );
  writeFileSync(
    join(dir, "kv_store_relation_chunks.json"),
    JSON.stringify({ "Ava Chen<SEP>Aurora Dynamics": { chunk_ids: ["doc-fake-000", "doc-fake-001"] } }),
  );
}

beforeAll(async () => {
  fixtureDir = join(tmpdir(), `graphatlas-etl-test-${Date.now()}`);
  mkdirSync(fixtureDir, { recursive: true });
  writeStaging(fixtureDir);
  const doc = await insertDocument({ title: "ETL fixture", kind: "md", fileType: "text/markdown" });
  docId = doc.id;
});

describe("ETL staging -> runtime", () => {
  test("loads staging and aligns chunk ids 1:1", async () => {
    const result = await runEtl(fixtureDir, docId, { embed: fakeEmbed() });
    expect(result.chunks).toBe(2);
    expect(result.entities).toBe(2);
    expect(result.relations).toBe(1);
    expect(result.chunkIds.sort()).toEqual(["doc-fake-000", "doc-fake-001"]);

    const sql = getDb();
    const rows = await sql<{ id: string }[]>`
      SELECT id FROM graphatlas.chunks WHERE document_id = ${docId} ORDER BY id
    `;
    expect(rows.map((r) => r.id)).toEqual(["doc-fake-000", "doc-fake-001"]);
  });

  test("entities/relations carry parsed descriptions and chunk provenance", async () => {
    const sql = getDb();
    const [entity] = await sql<{ description: string; source_chunk_ids: string[] }[]>`
      SELECT description, source_chunk_ids FROM graphatlas.entities WHERE id = 'Aurora Dynamics'
    `;
    expect(entity.description).toBe("Aurora Dynamics builds search tools.");
    expect(entity.source_chunk_ids).toEqual(["doc-fake-000"]);

    const [rel] = await sql<{ keywords: string; description: string; source_chunk_ids: string[] }[]>`
      SELECT keywords, description, source_chunk_ids FROM graphatlas.relations WHERE src_id = 'Ava Chen'
    `;
    expect(rel.keywords).toBe("leads");
    expect(rel.description).toBe("Ava Chen leads Aurora Dynamics.");
    expect(rel.source_chunk_ids.sort()).toEqual(["doc-fake-000", "doc-fake-001"]);
  });

  test("embeddings and tsvector are populated; document becomes ready", async () => {
    const sql = getDb();
    const [chunk] = await sql<{ embedding: unknown; text_search: unknown }[]>`
      SELECT embedding, text_search FROM graphatlas.chunks WHERE id = 'doc-fake-000'
    `;
    expect(chunk.embedding).not.toBeNull();
    expect(chunk.text_search).not.toBeNull();
    const [doc] = await sql<{ status: string }[]>`SELECT status FROM graphatlas.documents WHERE id = ${docId}`;
    expect(doc.status).toBe("ready");
  });

  test("rerun is idempotent (no duplicate rows, counts stable)", async () => {
    const again = await runEtl(fixtureDir, docId, { embed: fakeEmbed() });
    expect(again.chunks).toBe(2);
    const sql = getDb();
    const chunkCount = await sql<{ n: bigint }[]>`
      SELECT count(*) AS n FROM graphatlas.chunks WHERE document_id = ${docId}
    `;
    expect(Number(chunkCount[0].n)).toBe(2);
    const entityCount = await sql<{ n: bigint }[]>`
      SELECT count(*) AS n FROM graphatlas.entities WHERE id IN ('Aurora Dynamics', 'Ava Chen')
    `;
    expect(Number(entityCount[0].n)).toBe(2);
  });
});

afterAll(async () => {
  await closeDb();
  rmSync(fixtureDir, { recursive: true, force: true });
});
