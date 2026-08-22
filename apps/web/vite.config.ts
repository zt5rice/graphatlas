import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173, // 3000 may be taken by other projects (e.g., Next.js dev server)
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
  },
});
