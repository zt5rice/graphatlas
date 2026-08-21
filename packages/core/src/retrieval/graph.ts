import type { Sql } from "postgres";
import { bfs } from "./bfs";
import type { GraphEntity, GraphRecallResult, GraphRelation } from "./types";

export type GraphRecallOptions = {
  maxHop?: number;
};

type RelationRow = {
  id: string;
  src_id: string;
  tgt_id: string;
  keywords: string;
  description: string;
  source_chunk_ids: string[];
};

type EntityRow = {
  id: string;
  name: string;
  entity_type: string;
  description: string;
  source_chunk_ids: string[];
};

/**
 * Graph recall: from seed entities (query mention + vector hits), expand up to
 * `maxHop` hops over graphatlas.relations (undirected), then collect reached
 * entities, relations, and the chunks they cite.
 */
export async function graphRecall(
  sql: Sql,
  seeds: string[],
  opts: GraphRecallOptions = {},
): Promise<GraphRecallResult> {
  const maxHop = opts.maxHop ?? 2;
  const uniqueSeeds = Array.from(new Set(seeds));
  if (uniqueSeeds.length === 0) {
    return { seeds: [], entities: [], relations: [], chunkIds: [] };
  }

  // Iterative per-hop expansion (no unbounded edge scan).
  const relationRows: RelationRow[] = [];
  const seenRelations = new Set<string>();
  let frontier = uniqueSeeds;
  const visited = new Set<string>(uniqueSeeds);

  for (let hop = 0; hop < maxHop && frontier.length > 0; hop++) {
    const rows = await sql<RelationRow[]>`
      SELECT id, src_id, tgt_id, keywords, description, source_chunk_ids
      FROM graphatlas.relations
      WHERE src_id = ANY(${frontier}) OR tgt_id = ANY(${frontier})
    `;
    const next: string[] = [];
    for (const row of rows) {
      if (!seenRelations.has(row.id)) {
        seenRelations.add(row.id);
        relationRows.push(row);
      }
      for (const neighbor of [row.src_id, row.tgt_id]) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          next.push(neighbor);
        }
      }
    }
    frontier = next;
  }

  const visitedList = Array.from(visited);
  const entityRows = await sql<EntityRow[]>`
    SELECT id, name, entity_type, description, source_chunk_ids
    FROM graphatlas.entities
    WHERE id = ANY(${visitedList})
  `;
  const byId = new Map(entityRows.map((e) => [e.id, e]));

  const entities: GraphEntity[] = visitedList
    .map((id, index) => {
      const row = byId.get(id);
      if (!row) return null;
      return {
        id: row.id,
        name: row.name,
        entityType: row.entity_type,
        description: row.description,
        rank: index + 1,
      };
    })
    .filter((e): e is GraphEntity => e !== null);

  const relations: GraphRelation[] = relationRows.map((row, index) => ({
    id: row.id,
    srcId: row.src_id,
    tgtId: row.tgt_id,
    keywords: row.keywords,
    description: row.description,
    rank: index + 1,
    sourceChunkIds: row.source_chunk_ids,
  }));

  const chunkIds = Array.from(
    new Set(
      relations.flatMap((r) => r.sourceChunkIds).concat(entityRows.flatMap((e) => e.source_chunk_ids)),
    ),
  );

  return { seeds: uniqueSeeds, entities, relations, chunkIds };
}
