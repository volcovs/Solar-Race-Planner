import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: process.env.VITE_BASE ?? "/",
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // In dev, /api/* goes to the FastAPI service.
    proxy: { "/api": { target: process.env.API_URL ?? "http://localhost:8000", rewrite: (p) => p.replace(/^\/api/, "") } },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    // Node 25+ has its own localStorage, which hides jsdom's browser one in tests.
    execArgv: ["--no-experimental-webstorage"],
  },
});
