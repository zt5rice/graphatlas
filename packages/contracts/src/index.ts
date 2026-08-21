/**
 * @graphatlas/contracts
 * Shared request/response types across api / web / core / db.
 */
export type HealthResponse = {
  status: "ok";
  service: string;
  time: string;
};
