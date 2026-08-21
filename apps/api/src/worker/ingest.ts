import { join, resolve } from "node:path";
import {
  getDocument,
  runEtl,
  updateDocumentStatus,
  updateJob,
  type EmbedFn,
} from "@graphatlas/db";
import { getApiConfig } from "../config";

export type ExtractorFn = (
  filePath: string,
  workspace: string,
) => Promise<{ exitCode: number; stdout: string }>;

/**
 * Injectable pipeline dependencies. Tests override these to avoid network/LLM calls;
 * the production path uses the real Python extractor + real embeddings.
 */
export const pipelineDeps: { extractor?: ExtractorFn; embed?: EmbedFn } = {};

async function defaultExtractor(filePath: string, workspace: string) {
  const cfg = getApiConfig();
  const proc = Bun.spawn(
    [
      cfg.uvPath,
      "run",
      "--project",
      "extractor",
      "orgrag-extract",
      "ingest",
      filePath,
      "--workspace",
      workspace,
    ],
    { cwd: cfg.repoRoot, env: process.env },
  );
  const stdout = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  return { exitCode, stdout };
}

/**
 * Real ingest pipeline: extraction (Python sidecar) -> ETL -> job/document ready.
 * Stage timings are recorded in the job row; failures flip job+document to failed.
 */
export async function runIngestPipeline(docId: string, jobId: string): Promise<void> {
  const cfg = getApiConfig();
  const started = Date.now();
  try {
    const doc = await getDocument(docId);
    if (!doc) throw new Error("document not found");
    const filename = String(doc.metadata.original_filename ?? "");
    if (!filename) throw new Error("document has no original_filename metadata");
    const filePath = join(cfg.uploadDir, docId, filename);
    const workspace = `staging_${docId}`;
    const workspaceDir = resolve(cfg.repoRoot, ".graph-rag-workdir", workspace);

    await updateDocumentStatus(docId, "processing");
    await updateJob(jobId, { status: "running", stage: "extracting" });

    const extractionStart = Date.now();
    const extractor = pipelineDeps.extractor ?? defaultExtractor;
    const { exitCode, stdout } = await extractor(filePath, workspace);
    if (exitCode !== 0) {
      throw new Error(`extractor failed (exit ${exitCode}): ${stdout.slice(0, 800)}`);
    }
    const extractionMs = Date.now() - extractionStart;

    await updateJob(jobId, { status: "running", stage: "etl" });
    const etlStart = Date.now();
    await runEtl(workspaceDir, docId, { embed: pipelineDeps.embed });
    const etlMs = Date.now() - etlStart;

    await updateJob(jobId, {
      status: "ready",
      stage: "done",
      timings: {
        extraction_ms: extractionMs,
        etl_ms: etlMs,
        total_ms: Date.now() - started,
      },
    });
  } catch (err) {
    await updateJob(jobId, {
      status: "failed",
      stage: "failed",
      error: { message: String(err) },
    });
    await updateDocumentStatus(docId, "failed");
  }
}
