import { app } from "./app";
import { getApiConfig } from "./config";
import { enableE2EMode } from "./worker/e2eMode";

if (process.env.E2E_MODE === "1") {
  enableE2EMode();
}

export default {
  port: getApiConfig().port,
  fetch: app.fetch,
};
