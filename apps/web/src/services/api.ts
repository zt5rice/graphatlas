import type { DocumentRecord, JobRecord } from "@graphatlas/contracts";

const BASE = "/api/v1";

export type SearchResult = {
  chunk_id: string;
  document_id: string;
  snippet: string;
  score: number;
  match_types: string[];
};

export type SearchResponse = {
  query: string;
  mode: string;
  mode_source: string;
  results: SearchResult[];
  evidence: { entities: { id: string; name: string; type: string; description: string }[]; relations: unknown[] };
  diagnostics: { path: string; status: string; candidates: number }[];
  fusion: { method: string; k: number };
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export function listDocuments(): Promise<DocumentRecord[]> {
  return request("/documents");
}

export async function uploadDocument(file: File, title?: string): Promise<DocumentRecord> {
  const form = new FormData();
  form.append("file", file);
  if (title) form.append("title", title);
  return request("/documents", { method: "POST", body: form });
}

export function ingestDocument(id: string): Promise<{ job_id: string }> {
  return request(`/documents/${id}/ingest`, { method: "POST" });
}

export function getJob(id: string): Promise<JobRecord> {
  return request(`/jobs/${id}`);
}

export function search(query: string): Promise<SearchResponse> {
  return request("/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, top_k: 10 }),
  });
}

export function fetchGraph(entity?: string): Promise<import("../graph/transform").GraphResponse> {
  const params = new URLSearchParams();
  if (entity) params.set("entity", entity);
  params.set("depth", "1");
  return request(`/graph?${params.toString()}`);
}

export type ChatStreamEvent = { type: string; data: Record<string, unknown> };

export async function chatStream(
  query: string,
  onEvent: (event: ChatStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`chat HTTP ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const lines = part.split("\n");
      const eventType = lines.find((l) => l.startsWith("event: "))?.slice(7) ?? "message";
      const dataLine = lines.find((l) => l.startsWith("data: "));
      if (!dataLine) continue;
      try {
        onEvent({ type: eventType, data: JSON.parse(dataLine.slice(6)) as Record<string, unknown> });
      } catch {
        // ignore partial lines
      }
    }
  }
}
