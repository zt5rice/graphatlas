import { expect, test } from "@playwright/test";

test.describe("scenario A: upload -> ingest -> graph", () => {
  test("uploads a document, ingests it, and shows the graph entity", async ({ page }) => {
    await page.goto("/");
    await page.setInputFiles("input[type=file]", "data/corpus/02-teams.md");
    await page.getByText("Uploaded. Trigger ingest to build the graph.").waitFor({ timeout: 10_000 });

    await page.getByRole("button", { name: "Ingest" }).first().click();
    await page.getByText("Job ready (done)").waitFor({ timeout: 15_000 });

    await page.goto("/graph");
    await page.getByPlaceholder(/Entity name/i).fill("E2E CEO");
    await page.getByRole("button", { name: "Explore" }).click();
    await expect(page.getByText("E2E CEO", { exact: true }).first()).toBeVisible({ timeout: 10_000 });
  });
});
