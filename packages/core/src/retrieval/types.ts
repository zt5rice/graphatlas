export type RecallCandidate = {
  chunkId: string;
  documentId: string;
  text: string;
  snippet: string;
  matchTypes: string[];
  ranks: Record<string, number>;
  rawScores: Record<string, number>;
};
