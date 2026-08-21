import { getDb, closeDb } from "./db";

const EXPECTED_TABLES = [
  "chunks",
  "documents",
  "entities",
  "eval_runs",
  "facts",
  "jobs",
  "relations",
  "schema_migrations",
];

export async function verifySchema(): Promise<{ ok: boolean; tables: string[]; missing: string[] }> {
  const sql = getDb();
  const rows = await sql<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'graphatlas'
    ORDER BY table_name
  `;
  const tables = rows.map((r) => r.table_name);
  const missing = EXPECTED_TABLES.filter((t) => !tables.includes(t));
  return { ok: missing.length === 0, tables, missing };
}

if (import.meta.main) {
  try {
    const result = await verifySchema();
    console.log("[db:verify]", result.ok ? "OK" : "MISSING TABLES", JSON.stringify(result, null, 2));
    if (!result.ok) process.exit(1);
  } finally {
    await closeDb();
  }
}
