import { readFileSync } from "node:fs";
import { join } from "node:path";

export type StagingChunk = { id: string; content: string };
export type StagingEntity = { name: string; description: string; chunkIds: string[] };
export type StagingRelation = {
  srcId: string;
  tgtId: string;
  keywords: string;
  description: string;
  chunkIds: string[];
};

export type StagingData = {
  chunks: StagingChunk[];
  entities: StagingEntity[];
  relations: StagingRelation[];
};

function readJson<T>(dir: string, name: string): T {
  return JSON.parse(readFileSync(join(dir, name), "utf8")) as T;
}

function splitDescription(content: string): string {
  const nl = content.indexOf("\n");
  return nl >= 0 ? content.slice(nl + 1).trim() : "";
}

function parseRelationContent(content: string): { keywords: string; description: string } {
  const tab = content.indexOf("\t");
  if (tab < 0) return { keywords: "", description: "" };
  const keywords = content.slice(0, tab);
  const lines = content.slice(tab + 1).split("\n");
  const description = lines.length >= 3 ? lines.slice(2).join("\n").trim() : "";
  return { keywords, description };
}

/**
 * Reads a LightRAG JSON staging workspace (produced by extractor/).
 * Vectors are NOT read here: the ETL re-embeds text with the same model.
 */
export function loadStaging(workspaceDir: string): StagingData {
  const chunksRaw = readJson<Record<string, { content?: string }>>(workspaceDir, "kv_store_text_chunks.json");
  const entityChunkMap = readJson<Record<string, { chunk_ids?: string[] }>>(
    workspaceDir,
    "kv_store_entity_chunks.json",
  );
  const relationChunkMap = readJson<Record<string, { chunk_ids?: string[] }>>(
    workspaceDir,
    "kv_store_relation_chunks.json",
  );
  const entityItems = readJson<{ data?: { entity_name?: string; content?: string }[] }>(
    workspaceDir,
    "vdb_entities.json",
  ).data ?? [];
  const relationItems = readJson<
    { data?: { src_id?: string; tgt_id?: string; content?: string }[] }
  >(workspaceDir, "vdb_relationships.json").data ?? [];

  const chunks: StagingChunk[] = Object.entries(chunksRaw)
    .map(([id, v]) => ({ id, content: v.content ?? "" }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const entities: StagingEntity[] = entityItems
    .map((it) => {
      const name = String(it.entity_name ?? "").trim();
      if (!name) return null;
      return {
        name,
        description: splitDescription(String(it.content ?? "")),
        chunkIds: entityChunkMap[name]?.chunk_ids ?? [],
      };
    })
    .filter((e): e is StagingEntity => e !== null);

  const relations: StagingRelation[] = relationItems
    .map((it) => {
      const srcId = String(it.src_id ?? "").trim();
      const tgtId = String(it.tgt_id ?? "").trim();
      if (!srcId || !tgtId) return null;
      const { keywords, description } = parseRelationContent(String(it.content ?? ""));
      return {
        srcId,
        tgtId,
        keywords,
        description,
        chunkIds: relationChunkMap[`${srcId}<SEP>${tgtId}`]?.chunk_ids ?? [],
      };
    })
    .filter((r): r is StagingRelation => r !== null);

  return { chunks, entities, relations };
}
