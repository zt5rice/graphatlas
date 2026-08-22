import { Hono } from "hono";
import { getDb } from "@graphatlas/db";
import { graphRecall } from "@graphatlas/core";

export const graphRouter = new Hono();

type GraphNodeOut = { id: string; label: string; type: string; description: string };
type GraphEdgeOut = { id: string; source: string; target: string; label: string; weight: number };

graphRouter.get("/graph", async (c) => {
  const entity = c.req.query("entity")?.trim() ?? "";
  const depth = Math.min(Number(c.req.query("depth") ?? 1) || 1, 2);
  const sql = getDb();

  let nodes: GraphNodeOut[] = [];
  let edges: GraphEdgeOut[] = [];

  if (entity) {
    const result = await graphRecall(sql, [entity], { maxHop: depth });
    if (result.entities.length === 0) {
      return c.json({ error: "entity not found" }, 404);
    }
    nodes = result.entities.map((n) => ({
      id: n.id,
      label: n.name,
      type: n.entityType,
      description: n.description,
    }));
    edges = result.relations.map((r) => ({
      id: r.id,
      source: r.srcId,
      target: r.tgtId,
      label: r.keywords,
      weight: 1,
    }));
  } else {
    const entityRows = await sql<{ id: string; name: string; entity_type: string; description: string }[]>`
      SELECT id, name, entity_type, description FROM graphatlas.entities ORDER BY name LIMIT 200
    `;
    const relationRows = await sql<{ id: string; src_id: string; tgt_id: string; keywords: string; weight: number }[]>`
      SELECT id, src_id, tgt_id, keywords, weight FROM graphatlas.relations LIMIT 500
    `;
    nodes = entityRows.map((n) => ({
      id: n.id,
      label: n.name,
      type: n.entity_type,
      description: n.description,
    }));
    edges = relationRows.map((r) => ({
      id: r.id,
      source: r.src_id,
      target: r.tgt_id,
      label: r.keywords,
      weight: Number(r.weight ?? 1),
    }));
  }

  return c.json({ entity: entity || null, depth, nodes, edges });
});
