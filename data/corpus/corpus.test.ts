import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const CORPUS_DIR = import.meta.dir;

const MD_FILES = readdirSync(CORPUS_DIR).filter((f) => /^\d{2}-.+\.md$/.test(f)).sort();
const CSV_FILES = ["headcount.csv", "sales-pipeline.csv"];

function parseFrontMatter(text: string): Record<string, string> {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return {};
  const out: Record<string, string> = {};
  for (const line of m[1]!.split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return out;
}

describe("GraphAtlas corpus", () => {
  test("has 10-15 markdown docs", () => {
    expect(MD_FILES.length).toBeGreaterThanOrEqual(10);
    expect(MD_FILES.length).toBeLessThanOrEqual(15);
  });

  test("every markdown doc has consistent front matter", () => {
    for (const file of MD_FILES) {
      const fm = parseFrontMatter(readFileSync(join(CORPUS_DIR, file), "utf8"));
      expect(fm.title, `${file}: title`).toBeTruthy();
      expect(["reference", "runbook", "record", "plan", "policy", "data"], `${file}: type`).toContain(fm.type);
      expect(fm.owner, `${file}: owner`).toBeTruthy();
      expect(fm.updated, `${file}: updated`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  test("csv files parse with consistent headers and rows", () => {
    for (const file of CSV_FILES) {
      const text = readFileSync(join(CORPUS_DIR, file), "utf8");
      const lines = text.trim().split("\n");
      expect(lines.length, `${file}: has header + rows`).toBeGreaterThan(1);
      const header = lines[0]!.split(",");
      expect(header.length, `${file}: header`).toBeGreaterThan(3);
      for (const row of lines.slice(1)) {
        expect(row.split(",").length, `${file} row`).toBe(header.length);
      }
    }
  });
});
