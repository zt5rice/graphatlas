import postgres from "postgres";
import { getDbConfig } from "./config";

let sql: postgres.Sql | undefined;

/**
 * Lazily-created shared connection pool for the GraphAtlas runtime schema.
 * All app queries use fully-qualified `graphatlas.*` names.
 */
export function getDb(): postgres.Sql {
  if (!sql) {
    sql = postgres(getDbConfig().url, {
      max: 10,
      idle_timeout: 30,
      connect_timeout: 10,
    });
  }
  return sql;
}

export async function pingDb(): Promise<boolean> {
  try {
    await getDb()`select 1`;
    return true;
  } catch {
    return false;
  }
}

export async function closeDb(): Promise<void> {
  if (sql) {
    await sql.end();
    sql = undefined;
  }
}
