import { getDb } from "../db";
import type { JobRecord, JobStatus } from "@graphatlas/contracts";

const SELECT = `
  id, document_id AS "documentId", status, stage, error, timings,
  created_at AS "createdAt", updated_at AS "updatedAt"
`;

export async function createJob(documentId: string): Promise<JobRecord> {
  const sql = getDb();
  const rows = await sql<JobRecord[]>`
    INSERT INTO graphatlas.jobs (id, document_id, status, stage)
    VALUES (${crypto.randomUUID()}, ${documentId}, 'queued', 'queued')
    RETURNING ${sql.unsafe(SELECT)}
  `;
  return rows[0]!;
}

export async function getJob(id: string): Promise<JobRecord | undefined> {
  const sql = getDb();
  const rows = await sql<JobRecord[]>`
    SELECT ${sql.unsafe(SELECT)}
    FROM graphatlas.jobs
    WHERE id = ${id}
  `;
  return rows[0];
}

export async function updateJob(
  id: string,
  input: { status: JobStatus; stage: string; error?: unknown; timings?: Record<string, unknown> },
): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE graphatlas.jobs
    SET status = ${input.status},
        stage = ${input.stage},
        error = ${input.error === undefined ? null : sql.json(input.error as never)},
        timings = ${sql.json((input.timings ?? {}) as never)},
        updated_at = now()
    WHERE id = ${id}
  `;
}
