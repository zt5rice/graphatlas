import { Hono } from "hono";
import { requireWriteAuth } from "../middleware/auth";
import { createJob, getDocument, getJob, updateJob } from "@graphatlas/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const jobsRouter = new Hono();

// Stub pipeline: queued -> running -> ready. Real extraction (lightrag-hku) lands in Day 2.
jobsRouter.post("/documents/:id/ingest", requireWriteAuth, async (c) => {
  const id = c.req.param("id")!;
  if (!UUID_RE.test(id)) return c.json({ error: "document not found" }, 404);
  const doc = await getDocument(id);
  if (!doc) return c.json({ error: "document not found" }, 404);

  const job = await createJob(id);

  setTimeout(async () => {
    try {
      const started = Date.now();
      await updateJob(job.id, { status: "running", stage: "stub:noop" });
      await new Promise((resolve) => setTimeout(resolve, 150));
      await updateJob(job.id, {
        status: "ready",
        stage: "stub:noop",
        timings: { pipeline_ms: Date.now() - started },
      });
    } catch (err) {
      await updateJob(job.id, {
        status: "failed",
        stage: "stub:noop",
        error: { message: String(err) },
      });
    }
  }, 0);

  return c.json({ job_id: job.id }, 202);
});

jobsRouter.get("/jobs/:id", async (c) => {
  const id = c.req.param("id")!;
  if (!UUID_RE.test(id)) return c.json({ error: "job not found" }, 404);
  const job = await getJob(id);
  if (!job) return c.json({ error: "job not found" }, 404);
  return c.json(job);
});
