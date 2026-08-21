import { app } from "./app";
import { getApiConfig } from "./config";

export default {
  port: getApiConfig().port,
  fetch: app.fetch,
};
