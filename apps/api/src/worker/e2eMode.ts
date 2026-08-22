import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getApiConfig } from "../config";
import { pipelineDeps } from "./ingest";
import { searchDeps } from "../services/search";

const DIM = 1536;
const CHUNK_ID = "doc-e2e-000";

/**
 * E2E mode (E2E_MODE=1): replaces the real Python extractor + real embeddings
 * with a deterministic in-process fixture so Playwright tests are fast and
 * stable (no LLM/network in the ingest path).
 */
export function enableE2EMode(): void {
  pipelineDeps.embed = async (texts) => texts.map(() => new Array(DIM).fill(0.01));
  searchDeps.embed = async () => new Array(DIM).fill(0.01);
  pipelineDeps.extractor = async (_filePath, workspace) => {
    const cfg = getApiConfig();
    const workspaceDir = join(cfg.repoRoot, ".graph-rag-workdir", workspace);
    mkdirSync(workspaceDir, { recursive: true });
    writeFileSync(
      join(workspaceDir, "kv_store_text_chunks.json"),
      JSON.stringify({
        [CHUNK_ID]: { content: "E2E CEO is the CEO of E2E Org. E2E Engineer reports to E2E CEO." },
      }),
    );
    writeFileSync(
      join(workspaceDir, "vdb_entities.json"),
      JSON.stringify({
        data: [
          { entity_name: "E2E CEO", content: "E2E CEO\nE2E CEO is the CEO of E2E Org." },
          { entity_name: "E2E Org", content: "E2E Org\nThe company entity." },
          { entity_name: "E2E Engineer", content: "E2E Engineer\nE2E Engineer reports to E2E CEO." },
        ],
      }),
    );
    writeFileSync(
      join(workspaceDir, "kv_store_entity_chunks.json"),
      JSON.stringify({
        "E2E CEO": { chunk_ids: [CHUNK_ID] },
        "E2E Org": { chunk_ids: [CHUNK_ID] },
        "E2E Engineer": { chunk_ids: [CHUNK_ID] },
      }),
    );
    writeFileSync(
      join(workspaceDir, "vdb_relationships.json"),
      JSON.stringify({
        data: [
          { src_id: "E2E CEO", tgt_id: "E2E Org", content: "leads\tE2E CEO\nE2E Org\nE2E CEO leads E2E Org." },
          {
            src_id: "E2E Engineer",
            tgt_id: "E2E CEO",
            content: "reports_to\tE2E Engineer\nE2E CEO\nE2E Engineer reports to E2E CEO.",
          },
        ],
      }),
    );
    writeFileSync(
      join(workspaceDir, "kv_store_relation_chunks.json"),
      JSON.stringify({
        "E2E CEO<SEP>E2E Org": { chunk_ids: [CHUNK_ID] },
        "E2E Engineer<SEP>E2E CEO": { chunk_ids: [CHUNK_ID] },
      }),
    );
    return { exitCode: 0, stdout: "e2e fake extractor ok" };
  };
}
