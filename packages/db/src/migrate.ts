import { readdirSync } from "node:fs";
import { join } from "node:path";
import { getDb, closeDb } from "./db";
import { getDbConfig } from "./config";

const MIGRATIONS_DIR = join(import.meta.dir, "migrations");

/**
 * Applies pending .sql migrations in filename order, each in its own transaction,
 * recorded in graphatlas.schema_migrations. Idempotent: applied versions are skipped.
 */
export async function migrate(): Promise<string[]> {
  const sql = getDb();
  const dim = getDbConfig().embeddingDimensions;

  await sql.unsafe("CREATE SCHEMA IF NOT EXISTS graphatlas");
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS graphatlas.schema_migrations (
      version    text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const applied = new Set(
    (
      await sql<{ version: string }[]>`
        SELECT version FROM graphatlas.schema_migrations
      `
    ).map((r) => r.version),
  );

  const newlyApplied: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const raw = await Bun.file(join(MIGRATIONS_DIR, file)).text();
    const body = raw.replaceAll("__EMBEDDING_DIM__", String(dim));
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`INSERT INTO graphatlas.schema_migrations (version) VALUES (${file})`;
    });
    newlyApplied.push(file);
    console.log(`[db:migrate] applied ${file}`);
  }
  console.log(`[db:migrate] up to date (${files.length} migrations, ${newlyApplied.length} new)`);
  return newlyApplied;
}

if (import.meta.main) {
  try {
    await migrate();
  } finally {
    await closeDb();
  }
}
