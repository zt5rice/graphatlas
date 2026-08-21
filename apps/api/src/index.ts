import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono();

app.use("/api/*", cors());

app.get("/health", (c) =>
  c.json({
    status: "ok",
    service: "graphatlas-api",
    time: new Date().toISOString(),
  }),
);

const port = Number(process.env.API_PORT ?? 3001);

export default {
  port,
  fetch: app.fetch,
};
