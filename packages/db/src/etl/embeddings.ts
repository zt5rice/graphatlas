/**
 * OpenAI-compatible embedding client used by the ETL. Uses the same
 * EMBEDDING_* env config as extraction (same model => comparable vectors).
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const baseUrl = (process.env.EMBEDDING_BASE_URL ?? "").replace(/\/+$/, "");
  const apiKey = process.env.EMBEDDING_API_KEY ?? "";
  const model = process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";
  if (!baseUrl || !apiKey) {
    throw new Error("EMBEDDING_BASE_URL and EMBEDDING_API_KEY are required for ETL embeddings");
  }

  const out: number[][] = [];
  const BATCH = 16;
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);
    const resp = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, input: batch }),
    });
    if (!resp.ok) {
      throw new Error(`embedding HTTP ${resp.status}: ${await resp.text()}`);
    }
    const data = (await resp.json()) as { data: { embedding: number[] }[] };
    if (data.data.length !== batch.length) {
      throw new Error("embedding response count mismatch");
    }
    out.push(...data.data.map((d) => d.embedding));
  }
  return out;
}
