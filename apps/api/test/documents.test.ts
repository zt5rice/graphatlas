import { afterAll, describe, expect, test } from "bun:test";
import { app } from "../src/app";
import { closeDb } from "@graphatlas/db";

async function upload(title: string, name: string, content: string) {
  const form = new FormData();
  form.append("title", title);
  form.append("file", new File([content], name, { type: "text/plain" }));
  return app.request("/api/v1/documents", { method: "POST", body: form });
}

describe("documents & jobs API", () => {
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

  test("ingest -> 202 with job_id; job eventually reaches ready", async () => {
    const doc = (await (await upload("Runbook", "runbook.md", "# Runbook\nRestart the service.")).json()) as {
      id: string;
    };
    const res = await app.request(`/api/v1/documents/${doc.id}/ingest`, { method: "POST" });
    expect(res.status).toBe(202);
    const { job_id } = (await res.json()) as { job_id: string };
    expect(job_id).toBeTruthy();

    await new Promise((resolve) => setTimeout(resolve, 500));
    const job = (await (await app.request(`/api/v1/jobs/${job_id}`)).json()) as {
      status: string;
      stage: string;
    };
    expect(job.status).toBe("ready");
    expect(job.stage).toBe("stub:noop");
  });

  test("unknown document ingest -> 404", async () => {
    const res = await app.request("/api/v1/documents/does-not-exist/ingest", { method: "POST" });
    expect(res.status).toBe(404);
  });
});

afterAll(async () => {
  await closeDb();
});
