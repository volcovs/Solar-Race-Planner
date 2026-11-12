import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // GitHub Pages serves the site under /<repo-name>/; the deploy workflow sets VITE_BASE.
  base: process.env.VITE_BASE ?? "/",
  plugins: [react()],
  server: {
    port: 5173,
    // In dev, /api/* goes to the FastAPI service.
    proxy: { "/api": { target: process.env.API_URL ?? "http://localhost:8000", rewrite: (p) => p.replace(/^\/api/, "") } },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
