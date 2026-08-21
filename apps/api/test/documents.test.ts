import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { app } from "../src/app";
import { closeDb, getDb } from "@graphatlas/db";
import { pipelineDeps, type ExtractorFn } from "../src/worker/ingest";

const REPO_ROOT = resolve(import.meta.dir, "..", "..", "..");
const DIM = 1536;
const created: { docIds: string[]; entityNames: string[]; workspaces: string[] } = {
  docIds: [],
  entityNames: [],
  workspaces: [],
};

async function upload(title: string, name: string, content: string) {
  const form = new FormData();
  form.append("title", title);
  form.append("file", new File([content], name, { type: "text/plain" }));
  return app.request("/api/v1/documents", { method: "POST", body: form });
}

function fakeEmbed() {
  return async (texts: string[]) => texts.map((_, i) => new Array(DIM).fill(0.001 * (i + 1)));
}

function writeFakeStaging(workspaceDir: string, docId: string) {
  const tag = docId.slice(0, 8);
  const chunkId = `doc-${tag}-000`;
  const org = `PipeOrg-${tag}`;
  const person = `PipePerson-${tag}`;
  mkdirSync(workspaceDir, { recursive: true });
  writeFileSync(
    join(workspaceDir, "kv_store_text_chunks.json"),
    JSON.stringify({ [chunkId]: { content: `${org} builds widgets.` } }),
  );
  writeFileSync(
    join(workspaceDir, "vdb_entities.json"),
    JSON.stringify({
      data: [
        { entity_name: org, content: `${org}\n${org} builds widgets.` },
        { entity_name: person, content: `${person}\n${person} runs ${org}.` },
      ],
    }),
  );
  writeFileSync(
    join(workspaceDir, "kv_store_entity_chunks.json"),
    JSON.stringify({ [org]: { chunk_ids: [chunkId] }, [person]: { chunk_ids: [chunkId] } }),
  );
  writeFileSync(
    join(workspaceDir, "vdb_relationships.json"),
    JSON.stringify({
      data: [
        { src_id: person, tgt_id: org, content: `runs\t${person}\n${org}\n${person} runs ${org}.` },
      ],
    }),
  );
  writeFileSync(
    join(workspaceDir, "kv_store_relation_chunks.json"),
    JSON.stringify({ [`${person}<SEP>${org}`]: { chunk_ids: [chunkId] } }),
  );
  created.entityNames.push(org, person);
}

function fakeExtractor(): ExtractorFn {
  return async (_filePath, workspace) => {
    const workspaceDir = resolve(REPO_ROOT, ".graph-rag-workdir", workspace);
    created.workspaces.push(workspaceDir);
    writeFakeStaging(workspaceDir, workspace.replace("staging_", ""));
    return { exitCode: 0, stdout: "fake extractor ok" };
  };
}

async function waitForJob(
  jobId: string,
  timeoutMs = 8000,
): Promise<{ status: string; stage: string; timings: Record<string, unknown> }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = (await (await app.request(`/api/v1/jobs/${jobId}`)).json()) as {
      status: string;
      stage: string;
      timings: Record<string, unknown>;
    };
    if (job.status === "ready" || job.status === "failed") return job;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`job ${jobId} did not finish within ${timeoutMs}ms`);
}

describe("documents & jobs API", () => {
  beforeAll(() => {
    pipelineDeps.extractor = fakeExtractor();
    pipelineDeps.embed = fakeEmbed();
  });

  test("upload md -> 201 with id; list and detail contain it", async () => {
    const res = await upload("Org chart", "org-chart.md", "# Org\nAcme's CTO is Li.");
    expect(res.status).toBe(201);
    const doc = (await res.json()) as { id: string; title: string; status: string };
    expect(doc.id).toBeTruthy();
    expect(doc.title).toBe("Org chart");
    expect(doc.status).toBe("uploaded");

    const list = (await (await app.request("/api/v1/documents")).json()) as { id: string }[];
    expect(list.some((d) => d.id === doc.id)).toBe(true);

    const detail = (await (
      await app.request(`/api/v1/documents/${doc.id}`)
    ).json()) as { title: string };
    expect(detail.title).toBe("Org chart");
  });

  test("reject unsupported file type -> 400", async () => {
    const form = new FormData();
    form.append("file", new File(["x"], "evil.exe", { type: "application/octet-stream" }));
    const res = await app.request("/api/v1/documents", { method: "POST", body: form });
    expect(res.status).toBe(400);
  });

  test("ingest -> 202; pipeline runs to ready with recorded stage timings", async () => {
    const doc = (await (await upload("Runbook", "runbook.md", "# Runbook\nRestart the service.")).json()) as {
      id: string;
    };
    created.docIds.push(doc.id);
    const res = await app.request(`/api/v1/documents/${doc.id}/ingest`, { method: "POST" });
    expect(res.status).toBe(202);
    const { job_id } = (await res.json()) as { job_id: string };

    const job = await waitForJob(job_id);
    expect(job.status).toBe("ready");
    expect(job.stage).toBe("done");
    expect(typeof job.timings.extraction_ms).toBe("number");
    expect(typeof job.timings.etl_ms).toBe("number");
    expect(typeof job.timings.total_ms).toBe("number");
  });

  test("3 fixture docs via API -> all jobs ready; timings recorded; docs ready", async () => {
    const docIds: string[] = [];
    const jobIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const doc = (await (await upload(`Fixture ${i}`, `fixture-${i}.md`, `# Doc ${i}\nContent ${i}`)).json()) as {
        id: string;
      };
      docIds.push(doc.id);
      created.docIds.push(doc.id);
      const res = await app.request(`/api/v1/documents/${doc.id}/ingest`, { method: "POST" });
      expect(res.status).toBe(202);
      jobIds.push(((await res.json()) as { job_id: string }).job_id);
    }
    for (const jobId of jobIds) {
      const job = await waitForJob(jobId);
      expect(job.status).toBe("ready");
      expect(job.stage).toBe("done");
      expect(typeof job.timings.total_ms).toBe("number");
    }
    const sql = getDb();
    const rows = await sql<{ status: string }[]>`
      SELECT status FROM graphatlas.documents WHERE id = ANY(${docIds})
    `;
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.status === "ready")).toBe(true);
  });

  test("unknown document ingest -> 404", async () => {
    const res = await app.request("/api/v1/documents/does-not-exist/ingest", { method: "POST" });
    expect(res.status).toBe(404);
  });
});

afterAll(async () => {
  const sql = getDb();
  if (created.entityNames.length > 0) {
    await sql`
      DELETE FROM graphatlas.relations
      WHERE src_id = ANY(${created.entityNames}) OR tgt_id = ANY(${created.entityNames})
    `;
    await sql`DELETE FROM graphatlas.entities WHERE id = ANY(${created.entityNames})`;
  }
  if (created.docIds.length > 0) {
    await sql`DELETE FROM graphatlas.chunks WHERE document_id = ANY(${created.docIds})`;
    await sql`DELETE FROM graphatlas.documents WHERE id = ANY(${created.docIds})`;
  }
  for (const ws of created.workspaces) rmSync(ws, { recursive: true, force: true });
  pipelineDeps.extractor = undefined;
  pipelineDeps.embed = undefined;
  await closeDb();
});
