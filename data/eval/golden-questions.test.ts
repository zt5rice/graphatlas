import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

type Question = {
  id: string;
  category: "single_hop" | "multi_hop" | "global" | "hard";
  question: string;
  golden_answer: string;
  expected_entities: string[];
  expected_relations: string[];
  expected_sources: string[];
  expected_chunk_ids: string[];
  notes?: string;
};

const EVAL_DIR = import.meta.dir;
const questions = JSON.parse(
  (await Bun.file(join(EVAL_DIR, "golden_questions.json")).text()) as string,
) as Question[];

const corpusFiles = readdirSync(join(EVAL_DIR, "..", "corpus")).filter((f) =>
  /^\d{2}-.+\.md$/.test(f),
);

describe("golden question set", () => {
  test("has exactly 50 questions", () => {
    expect(questions).toHaveLength(50);
  });

  test("ids are unique and sequential q001..q050", () => {
    const ids = questions.map((q) => q.id);
    expect(new Set(ids).size).toBe(50);
    for (let i = 1; i <= 50; i++) {
      expect(ids).toContain(`q${String(i).padStart(3, "0")}`);
    }
  });

  test("category balance is 15/15/10/10", () => {
    const counts: Record<string, number> = {};
    for (const q of questions) counts[q.category] = (counts[q.category] ?? 0) + 1;
    expect(counts.single_hop).toBe(15);
    expect(counts.multi_hop).toBe(15);
    expect(counts.global).toBe(10);
    expect(counts.hard).toBe(10);
  });

  test("every question has non-empty required fields", () => {
    for (const q of questions) {
      expect(q.question.length, `${q.id} question`).toBeGreaterThan(10);
      expect(q.golden_answer.length, `${q.id} golden_answer`).toBeGreaterThan(0);
      expect(Array.isArray(q.expected_entities), `${q.id} entities`).toBe(true);
      expect(Array.isArray(q.expected_relations), `${q.id} relations`).toBe(true);
      expect(Array.isArray(q.expected_sources), `${q.id} sources`).toBe(true);
      expect(Array.isArray(q.expected_chunk_ids), `${q.id} chunk ids`).toBe(true);
    }
  });

  test("expected_sources reference existing corpus files", () => {
    for (const q of questions) {
      for (const src of q.expected_sources) {
        expect(existsSync(join(EVAL_DIR, "..", "corpus", src)), `${q.id}: ${src}`).toBe(true);
      }
    }
  });

  test("every single_hop and multi_hop question has expected entities", () => {
    for (const q of questions) {
      if (q.category === "single_hop" || q.category === "multi_hop") {
        expect(q.expected_entities.length, `${q.id} entities`).toBeGreaterThan(0);
      }
    }
  });
});
