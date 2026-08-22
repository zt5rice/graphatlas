import { Hono } from "hono";
import { searchDocuments, type SearchInput } from "../services/search";
import type { QueryMode } from "@graphatlas/core";

type SearchBody = {
  query?: string;
  mode?: QueryMode;
  top_k?: number;
  min_score?: number;
  document_ids?: string[];
};

export const searchRouter = new Hono();

searchRouter.post("/search", async (c) => {
  const body = (await c.req.json().catch(() => null)) as SearchBody | null;
  const query = typeof body?.query === "string" ? body.query.trim() : "";
  if (!query) {
    return c.json({ error: "query is required" }, 400);
  }
  if (query.length > 2000) {
    return c.json({ error: "query must be at most 2000 characters" }, 400);
  }

  const rawTopK: number = body?.top_k ?? 10;
  if (!Number.isInteger(rawTopK) || rawTopK < 1 || rawTopK > 30) {
    return c.json({ error: "top_k must be an integer between 1 and 30" }, 400);
  }

  const minScore: number | undefined = body?.min_score;
  if (minScore !== undefined && (typeof minScore !== "number" || minScore < 0 || minScore > 1)) {
    return c.json({ error: "min_score must be between 0 and 1" }, 400);
  }

  const documentIds: string[] | undefined = body?.document_ids;
  if (
    documentIds !== undefined &&
    (!Array.isArray(documentIds) || documentIds.some((id) => typeof id !== "string"))
  ) {
    return c.json({ error: "document_ids must be an array of strings" }, 400);
  }

  const response = await searchDocuments({
    query,
    mode: body?.mode,
    topK: rawTopK,
    minScore,
    documentIds,
  });
  return c.json(response);
});
