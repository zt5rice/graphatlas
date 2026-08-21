import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getDb, closeDb } from "../src/db";
import { insertDocument } from "../src/repo/documents";
import { runEtl } from "../src/etl/run";
import type { EmbedFn } from "../src/etl/run";

const DIM = 1536;
const RUN = randomUUID().slice(0, 8);
const CHUNK_IDS = [`doc-${RUN}-000`, `doc-${RUN}-001`];
const ENTITY_NAMES = ["TestOrg", "TestPerson"];
let fixtureDir: string;
let docId: string;

function fakeEmbed(): EmbedFn {
  return async (texts: string[]) => texts.map((_, i) => new Array(DIM).fill(0.001 * (i + 1)));
}

function writeStaging(dir: string) {
  writeFileSync(
    join(dir, "kv_store_text_chunks.json"),
    JSON.stringify({
      [CHUNK_IDS[0]!]: { content: "TestOrg builds widgets." },
      [CHUNK_IDS[1]!]: { content: "TestPerson runs TestOrg." },
    }),
  );
  writeFileSync(
    join(dir, "vdb_entities.json"),
    JSON.stringify({
      data: [
        { entity_name: "TestOrg", content: "TestOrg\nTestOrg builds widgets." },
        { entity_name: "TestPerson", content: "TestPerson\nTestPerson runs TestOrg." },
      ],
    }),
  );
  writeFileSync(
    join(dir, "kv_store_entity_chunks.json"),
    JSON.stringify({
      TestOrg: { chunk_ids: [CHUNK_IDS[0]!] },
      TestPerson: { chunk_ids: [CHUNK_IDS[1]!] },
    }),
  );
  writeFileSync(
    join(dir, "vdb_relationships.json"),
    JSON.stringify({
      data: [
        {
          src_id: "TestPerson",
          tgt_id: "TestOrg",
          content: "runs\tTestPerson\nTestOrg\nTestPerson runs TestOrg.",
        },
      ],
    }),
  );
  writeFileSync(
    join(dir, "kv_store_relation_chunks.json"),
    JSON.stringify({ "TestPerson<SEP>TestOrg": { chunk_ids: CHUNK_IDS } }),
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
    expect(result.chunkIds.map((id) => id.split(":")[1]).sort()).toEqual([...CHUNK_IDS].sort());

    const sql = getDb();
    const rows = await sql<{ id: string }[]>`
      SELECT id FROM graphatlas.chunks WHERE document_id = ${docId} ORDER BY id
    `;
    expect(rows.map((r) => r.id.split(":")[1]).sort()).toEqual([...CHUNK_IDS].sort());
  });

  test("entities/relations carry parsed descriptions and chunk provenance", async () => {
    const sql = getDb();
    const [entity] = await sql<{ description: string; source_chunk_ids: string[] }[]>`
      SELECT description, source_chunk_ids FROM graphatlas.entities WHERE id = 'TestOrg'
    `;
    expect(entity.description).toBe("TestOrg builds widgets.");
    expect(entity.source_chunk_ids).toEqual([CHUNK_IDS[0]]);

    const [rel] = await sql<{ keywords: string; description: string; source_chunk_ids: string[] }[]>`
      SELECT keywords, description, source_chunk_ids FROM graphatlas.relations WHERE src_id = 'TestPerson'
    `;
    expect(rel.keywords).toBe("runs");
    expect(rel.description).toBe("TestPerson runs TestOrg.");
    expect(rel.source_chunk_ids.sort()).toEqual([...CHUNK_IDS].sort());
  });

  test("embeddings and tsvector are populated; document becomes ready", async () => {
    const sql = getDb();
    const [chunk] = await sql<{ embedding: unknown; text_search: unknown }[]>`
      SELECT embedding, text_search FROM graphatlas.chunks WHERE id LIKE ${`%:${CHUNK_IDS[0]}`}
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
      SELECT count(*) AS n FROM graphatlas.entities WHERE id IN (${ENTITY_NAMES[0]}, ${ENTITY_NAMES[1]})
    `;
    expect(Number(entityCount[0].n)).toBe(2);
  });
});

afterAll(async () => {
  const sql = getDb();
  await sql`
    DELETE FROM graphatlas.relations WHERE src_id IN (${ENTITY_NAMES[0]}, ${ENTITY_NAMES[1]}) OR tgt_id IN (${ENTITY_NAMES[0]}, ${ENTITY_NAMES[1]})
  `;
  await sql`
    DELETE FROM graphatlas.entities WHERE id IN (${ENTITY_NAMES[0]}, ${ENTITY_NAMES[1]})
  `;
  await sql`DELETE FROM graphatlas.chunks WHERE document_id = ${docId}`;
  await sql`DELETE FROM graphatlas.documents WHERE id = ${docId}`;
  await closeDb();
  rmSync(fixtureDir, { recursive: true, force: true });
});
