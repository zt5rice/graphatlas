import { getDb } from "../db";
import type { CreateDocumentInput, DocumentRecord, DocumentStatus } from "@graphatlas/contracts";

const SELECT = `
  id, title, kind, status, file_type AS "fileType", metadata,
  created_at AS "createdAt", updated_at AS "updatedAt"
`;

export async function insertDocument(input: CreateDocumentInput): Promise<DocumentRecord> {
  const sql = getDb();
  const rows = await sql<DocumentRecord[]>`
    INSERT INTO graphatlas.documents (title, kind, file_type, status, metadata)
    VALUES (${input.title}, ${input.kind}, ${input.fileType}, 'uploaded', ${sql.json((input.metadata ?? {}) as never)})
    RETURNING ${sql.unsafe(SELECT)}
  `;
  return rows[0]!;
}

export async function listDocuments(): Promise<DocumentRecord[]> {
  const sql = getDb();
  return sql<DocumentRecord[]>`
    SELECT ${sql.unsafe(SELECT)}
    FROM graphatlas.documents
    ORDER BY created_at DESC
  `;
}

export async function getDocument(id: string): Promise<DocumentRecord | undefined> {
  const sql = getDb();
  const rows = await sql<DocumentRecord[]>`
    SELECT ${sql.unsafe(SELECT)}
    FROM graphatlas.documents
    WHERE id = ${id}
  `;
  return rows[0];
}

export async function updateDocumentStatus(id: string, status: DocumentStatus): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE graphatlas.documents SET status = ${status}, updated_at = now() WHERE id = ${id}
  `;
}
