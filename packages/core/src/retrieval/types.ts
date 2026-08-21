export type RecallCandidate = {
  chunkId: string;
  documentId: string;
  text: string;
  snippet: string;
  matchTypes: string[];
  ranks: Record<string, number>;
  rawScores: Record<string, number>;
};

export type EntityHit = {
  id: string;
  name: string;
  score: number;
  rank: number;
};

export type RelationHit = {
  id: string;
  srcId: string;
  tgtId: string;
  keywords: string;
  description: string;
  score: number;
  rank: number;
};

export type VectorRecallResult = {
  chunks: RecallCandidate[];
  entities: EntityHit[];
  relations: RelationHit[];
};
