import { expect, request as pwRequest, test } from "@playwright/test";

test.beforeAll(async () => {
  // Seed the E2E fixture via the API so this spec is self-contained
  // (independent of test-file execution order).
  const ctx = await pwRequest.newContext({ baseURL: "http://localhost:3001" });
  const docRes = await ctx.post("/api/v1/documents", {
    multipart: {
      title: "E2E Chat Fixture",
      file: { name: "e2e-chat.md", mimeType: "text/markdown", buffer: Buffer.from("dummy") },
    },
  });
  const doc = (await docRes.json()) as { id: string };
  const ingestRes = await ctx.post(`/api/v1/documents/${doc.id}/ingest`);
  const { job_id } = (await ingestRes.json()) as { job_id: string };
  for (let i = 0; i < 20; i++) {
    const job = (await (await ctx.get(`/api/v1/jobs/${job_id}`)).json()) as { status: string };
    if (job.status === "ready" || job.status === "failed") break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  await ctx.dispose();
});

test.describe("scenario B: chat -> citation", () => {
  test("asks a question and shows streamed answer with evidence", async ({ page }) => {
    await page.goto("/chat");
    await page.getByPlaceholder(/Ask a question/i).fill("Who is the CEO?");
    await page.getByRole("button", { name: "Send" }).click();

    // A parsed evidence card appears (chunk-id badge + snippet from tool output).
    await expect(page.locator("span.text-sky-400").first()).toBeVisible({ timeout: 30_000 });
    // An assistant answer bubble exists with non-empty content.
    await expect(page.locator("span.text-slate-100").first()).toBeVisible({ timeout: 60_000 });
  });
});
