export type DbConfig = {
  url: string;
  embeddingDimensions: number;
};

export function getDbConfig(): DbConfig {
  const url =
    process.env.DATABASE_URL ??
    "postgres://graphatlas:graphatlas@localhost:5432/graphatlas";
  const dim = Number(process.env.EMBEDDING_DIMENSIONS ?? 1536);
  if (!Number.isInteger(dim) || dim <= 0) {
    throw new Error(`EMBEDDING_DIMENSIONS must be a positive integer, got ${dim}`);
  }
  return { url, embeddingDimensions: dim };
}
