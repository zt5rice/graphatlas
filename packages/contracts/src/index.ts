/**
 * @graphatlas/contracts
 * Shared request/response types across api / web / core / db.
 */
export type HealthResponse = {
  status: "ok";
  service: string;
  time: string;
};

export type DocumentKind = "md" | "txt" | "csv";
export type DocumentStatus = "uploaded" | "processing" | "ready" | "failed";
export type JobStatus = "queued" | "running" | "ready" | "failed";

export type DocumentRecord = {
  id: string;
  title: string;
  kind: DocumentKind;
  status: DocumentStatus;
  fileType: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type JobRecord = {
  id: string;
  documentId: string;
  status: JobStatus;
  stage: string;
  error: unknown | null;
  timings: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateDocumentInput = {
  title: string;
  kind: DocumentKind;
  fileType: string;
  metadata?: Record<string, unknown>;
};
