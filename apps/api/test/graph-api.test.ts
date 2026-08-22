import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { closeDb, getDb, migrate } from "@graphatlas/db";
import { app } from "../src/app";

const TAG = randomUUID().slice(0, 8);
const A = `GraphApiA-${TAG}`;
const B = `GraphApiB-${TAG}`;

beforeAll(async () => {
  await migrate();
  const sql = getDb();
  await sql`
    INSERT INTO graphatlas.entities (id, name, entity_type, description, source_chunk_ids, embedding_model, embedding_dim)
    VALUES (${A}, ${A}, 'PERSON', 'Entity A.', '[]'::jsonb, 'test', 1536)
  `;
  await sql`
    INSERT INTO graphatlas.entities (id, name, entity_type, description, source_chunk_ids, embedding_model, embedding_dim)
    VALUES (${B}, ${B}, 'ORG', 'Entity B.', '[]'::jsonb, 'test', 1536)
  `;
  await sql`
    INSERT INTO graphatlas.relations (id, src_id, tgt_id, keywords, description, weight, source_chunk_ids, embedding_model, embedding_dim)
    VALUES (${`${A}|${B}`}, ${A}, ${B}, 'works_at', 'A works at B.', 1.0, '[]'::jsonb, 'test', 1536)
  `;
});

describe("GET /api/v1/graph", () => {
  test("returns the 1-hop neighborhood of an entity", async () => {
    const res = await app.request(`/api/v1/graph?entity=${encodeURIComponent(A)}&depth=1`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      nodes: { id: string; label: string; type: string }[];
      edges: { source: string; target: string; label: string }[];
    };
    expect(data.nodes.map((n) => n.label).sort()).toEqual([A, B].sort());
    expect(data.edges.some((e) => e.source === A && e.target === B)).toBe(true);
  });

  test("returns the overview graph without an entity", async () => {
    const res = await app.request("/api/v1/graph");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { nodes: { label: string }[] };
    expect(data.nodes.some((n) => n.label === A)).toBe(true);
  });

  test("404 for an unknown entity", async () => {
    const res = await app.request("/api/v1/graph?entity=nonexistent-entity");
    expect(res.status).toBe(404);
  });
});

afterAll(async () => {
  const sql = getDb();
  await sql`DELETE FROM graphatlas.relations WHERE src_id = ANY(${[A, B]}) OR tgt_id = ANY(${[A, B]})`;
  await sql`DELETE FROM graphatlas.entities WHERE id = ANY(${[A, B]})`;
  await closeDb();
});
