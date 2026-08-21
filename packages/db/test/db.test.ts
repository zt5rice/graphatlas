import { afterAll, describe, expect, test } from "bun:test";
import { getDb, pingDb, closeDb } from "../src/db";
import { migrate } from "../src/migrate";
import { verifySchema } from "../src/verify";

describe("graphatlas db", () => {
  test("pingDb returns true against a live PostgreSQL", async () => {
    expect(await pingDb()).toBe(true);
  });

  test("migrate is idempotent and verifySchema passes", async () => {
    const first = await migrate();
    expect(Array.isArray(first)).toBe(true);
    const second = await migrate();
    expect(second).toHaveLength(0); // already applied
    const result = await verifySchema();
    expect(result.ok).toBe(true);
    expect(result.tables).toContain("documents");
    expect(result.tables).toContain("chunks");
    expect(result.tables).toContain("entities");
    expect(result.tables).toContain("relations");
    expect(result.tables).toContain("jobs");
  });

  test("documents table accepts an insert", async () => {
    const sql = getDb();
    const rows = await sql`
      INSERT INTO graphatlas.documents (title, kind, file_type, status)
      VALUES ('integration fixture', 'md', 'markdown', 'uploaded')
      RETURNING id, title, status
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("integration fixture");
    expect(rows[0].status).toBe("uploaded");
  });
});

afterAll(async () => {
  await closeDb();
});
