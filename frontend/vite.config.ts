import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { loadEnv, searchForWorkspaceRoot, type Plugin } from "vite";
import { defineConfig } from "vitest/config";

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Writes dist/sw.js from src/service-worker.js: every built file to save for offline, and a
 * version from their contents, so each deploy is a new worker (and the app offers "Reload").
 */
function serviceWorker(api: RegExp): Plugin {
  let root = "";
  let outDir = "";
  return {
    name: "service-worker",
    apply: "build",
    configResolved(config) {
      root = config.root;
      outDir = join(config.root, config.build.outDir);
    },
    closeBundle() {
      const files = readdirSync(outDir, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name !== "sw.js" && !entry.name.startsWith("."))
        .map((entry) => relative(outDir, join(entry.parentPath, entry.name)).split(sep).join("/"))
        .sort();
      const hash = createHash("sha256");
      for (const file of files) hash.update(file).update(readFileSync(join(outDir, file)));
      const source = readFileSync(join(root, "src/service-worker.js"), "utf8")
        .replace("__FILES__", JSON.stringify(files))
        .replace("__VERSION__", JSON.stringify(hash.digest("hex").slice(0, 12)))
        .replace("__API__", JSON.stringify(api.source));
      writeFileSync(join(outDir, "sw.js"), source);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd()), ...process.env };
  // Only the plan and forecast are kept for offline; /health must say when the API is unreachable.
  const api = env.VITE_API_URL ? `^${escapeRegExp(env.VITE_API_URL.replace(/\/$/, ""))}` : "^[^?#]*/api";

  return {
    base: process.env.VITE_BASE ?? "/",
    plugins: [react(), tailwindcss(), serviceWorker(new RegExp(`${api}/(plan|forecast)(\\?|$)`))],
    server: {
      port: 5173,
      // In dev, /api/* goes to the FastAPI service.
      proxy: { "/api": { target: env.API_URL ?? "http://localhost:8000", rewrite: (p) => p.replace(/^\/api/, "") } },
      // Also ../configs: a test checks the built-in reference car against configs/car.reference.yaml.
      fs: { allow: [searchForWorkspaceRoot(process.cwd()), "../configs"] },
    },
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      // Node 25+ has its own localStorage, which hides jsdom's browser one in tests.
      execArgv: ["--no-experimental-webstorage"],
    },
  };
});
