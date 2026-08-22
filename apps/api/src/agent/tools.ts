import { getDb, getDocument } from "@graphatlas/db";
import { graphRecall } from "@graphatlas/core";
import { searchDocuments } from "../services/search";
import type { ToolDef } from "./types";

export const TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "search_hybrid",
      description:
        "Hybrid search (keyword + vector + graph, RRF-fused) over the knowledge base. Use for factual questions.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Natural language question" },
          mode: { type: "string", enum: ["local", "global", "mix"], description: "Optional retrieval mode" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "graph_neighbors",
      description: "Entities and relations directly connected to an entity (1-hop).",
      parameters: {
        type: "object",
        properties: { entity: { type: "string", description: "Entity name" } },
        required: ["entity"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_document",
      description: "Full document metadata and its chunks by document id.",
      parameters: {
        type: "object",
        properties: { document_id: { type: "string", description: "Document UUID" } },
        required: ["document_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lookup_entity",
      description: "Look up an entity by exact name (description, type, source chunks).",
      parameters: {
        type: "object",
        properties: { name: { type: "string", description: "Entity name" } },
        required: ["name"],
      },
    },
  },
];

export async function executeTool(name: string, args: Record<string, string>) {
  switch (name) {
    case "search_hybrid": {
      const response = await searchDocuments({
        query: args.query ?? "",
        mode: (args.mode as "local" | "global" | "mix" | undefined) ?? "mix",
        topK: 5,
      });
      return {
        results: response.results.map((r) => ({
          chunk_id: r.chunk_id,
          document_id: r.document_id,
          snippet: r.snippet,
          score: r.score,
          match_types: r.match_types,
        })),
        evidence: {
          entities: response.evidence.entities.map((e) => e.name),
          relations: response.evidence.relations.map((r) => `${r.src} -> ${r.tgt}`),
        },
      };
    }
    case "graph_neighbors": {
      const sql = getDb();
      const result = await graphRecall(sql, [args.entity ?? ""], { maxHop: 1 });
      return {
        entities: result.entities.map((e) => ({ name: e.name, description: e.description })),
        relations: result.relations.map((r) => ({
          src: r.srcId,
          tgt: r.tgtId,
          keywords: r.keywords,
          description: r.description,
        })),
      };
    }
    case "get_document": {
      const doc = await getDocument(args.document_id ?? "");
      if (!doc) return { error: "document not found" };
      const sql = getDb();
      const chunks = await sql<{ id: string; text: string }[]>`
        SELECT id, text FROM graphatlas.chunks WHERE document_id = ${doc.id} ORDER BY chunk_index
      `;
      return {
        id: doc.id,
        title: doc.title,
        status: doc.status,
        chunks: chunks.map((c) => ({ chunk_id: c.id, text: c.text })),
      };
    }
    case "lookup_entity": {
      const sql = getDb();
      const rows = await sql<{ id: string; name: string; entity_type: string; description: string; source_chunk_ids: string[] }[]>`
        SELECT id, name, entity_type, description, source_chunk_ids
        FROM graphatlas.entities WHERE name = ${args.name ?? ""}
      `;
      if (rows.length === 0) return { error: "entity not found" };
      return rows[0];
    }
    default:
      return { error: `unknown tool '${name}'` };
  }
}

export function summarizeToolOutput(value: unknown): string {
  const text = JSON.stringify(value);
  return text.length > 2000 ? `${text.slice(0, 2000)}... (truncated)` : text;
}
