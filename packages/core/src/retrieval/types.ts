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

export type GraphEntity = {
  id: string;
  name: string;
  entityType: string;
  description: string;
  rank: number;
};

export type GraphRelation = {
  id: string;
  srcId: string;
  tgtId: string;
  keywords: string;
  description: string;
  rank: number;
  sourceChunkIds: string[];
};

export type GraphRecallResult = {
  seeds: string[];
  entities: GraphEntity[];
  relations: GraphRelation[];
  chunkIds: string[];
};
