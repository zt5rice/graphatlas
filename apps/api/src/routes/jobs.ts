import { Hono } from "hono";
import { requireWriteAuth } from "../middleware/auth";
import { createJob, getDocument, getJob } from "@graphatlas/db";
import { runIngestPipeline } from "../worker/ingest";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const jobsRouter = new Hono();

jobsRouter.post("/documents/:id/ingest", requireWriteAuth, async (c) => {
  const id = c.req.param("id")!;
  if (!UUID_RE.test(id)) return c.json({ error: "document not found" }, 404);
  const doc = await getDocument(id);
  if (!doc) return c.json({ error: "document not found" }, 404);

  const job = await createJob(id);
  void runIngestPipeline(id, job.id);

  return c.json({ job_id: job.id }, 202);
});

jobsRouter.get("/jobs/:id", async (c) => {
  const id = c.req.param("id")!;
  if (!UUID_RE.test(id)) return c.json({ error: "job not found" }, 404);
  const job = await getJob(id);
  if (!job) return c.json({ error: "job not found" }, 404);
  return c.json(job);
});
