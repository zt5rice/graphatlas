export type QueryMode = "local" | "global" | "mix";
export type ModeSource = "rule" | "llm" | "fallback";

export type ModeDecision = {
  mode: QueryMode;
  source: ModeSource;
  matchedRule?: string;
};

const LOCAL_KEYWORDS = [
  "reports to",
  "report to",
  "reporting to",
  "works under",
  "managed by",
  "manages",
  "who is",
  "who owns",
  "who leads",
  "member of",
  "team lead",
  "manager of",
  "supervisor",
  "org chart",
  "reporting chain",
  "boss",
];

const GLOBAL_KEYWORDS = [
  "how many",
  "list all",
  "list the",
  "all the",
  "which teams",
  "which projects",
  "which customers",
  "overview",
  "summary",
  "compare",
  "total",
  "overall",
  "count",
  "every",
];

function hits(query: string, keywords: string[]): string[] {
  return keywords.filter((keyword) => query.includes(keyword));
}

/**
 * Deterministic rule router (local/global/mix) with an optional LLM fallback
 * classifier, defaulting to `mix` (broadest coverage) on any failure.
 */
export async function resolveMode(
  query: string,
  deps: { llmClassify?: (q: string) => Promise<string> } = {},
): Promise<ModeDecision> {
  const normalized = query.toLowerCase();
  const localHits = hits(normalized, LOCAL_KEYWORDS);
  const globalHits = hits(normalized, GLOBAL_KEYWORDS);

  if (localHits.length > 0 && globalHits.length > 0) {
    return { mode: "mix", source: "rule", matchedRule: `compound:${localHits[0]}+${globalHits[0]}` };
  }
  if (localHits.length > 0) {
    return { mode: "local", source: "rule", matchedRule: `local:${localHits[0]}` };
  }
  if (globalHits.length > 0) {
    return { mode: "global", source: "rule", matchedRule: `global:${globalHits[0]}` };
  }

  if (deps.llmClassify) {
    try {
      const label = (await deps.llmClassify(query)).trim().toLowerCase();
      if (label === "local" || label === "global") {
        return { mode: label, source: "llm" };
      }
      return { mode: "mix", source: "llm" };
    } catch {
      return { mode: "mix", source: "fallback" };
    }
  }

  return { mode: "mix", source: "fallback" };
}
