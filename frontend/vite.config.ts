import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { loadEnv, searchForWorkspaceRoot } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd()), ...process.env };
  // The API calls the service worker may answer from its cache when offline: the plan and the
  // forecast. Not /health, which must say "offline" when the API can't be reached.
  const api = env.VITE_API_URL ? `^${escapeRegExp(env.VITE_API_URL.replace(/\/$/, ""))}` : "^[^?#]*/api";
  const cachedApi = new RegExp(`${api}/(plan|forecast)(\\?|$)`);

  return {
    base: process.env.VITE_BASE ?? "/",
    plugins: [
      react(),
      tailwindcss(),
      // Offline (FE-09): a service worker keeps the app, the last plan and forecast, and the map
      // tiles already seen. Only in builds; `npm run dev` runs without it.
      VitePWA({
        manifest: false, // public/manifest.json
        registerType: "prompt", // a new version waits for the user (src/app/UpdatePrompt.tsx)
        injectRegister: false,
        workbox: {
          globPatterns: ["**/*.{html,js,mjs,css,woff2,svg,png,json,geojson}"],
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, // the map chunk is ~1 MB
          navigateFallback: "index.html",
          navigateFallbackDenylist: [/^\/api\//],
          // On the first visit, take charge of the open page at once, so the tiles and plan seen
          // then are saved too. (Updates still wait for "Reload": there's an old version in charge.)
          clientsClaim: true,
          runtimeCaching: [
            {
              urlPattern: cachedApi,
              handler: "NetworkFirst",
              options: { cacheName: "api", networkTimeoutSeconds: 8, expiration: { maxEntries: 10 } },
            },
            {
              // Map tiles and fonts don't change at a given URL: once seen, from the cache.
              urlPattern: /^https:\/\/tiles\.openfreemap\.org\/.*\.(pbf|png|jpg|webp)$/,
              handler: "CacheFirst",
              options: { cacheName: "map-tiles", expiration: { maxEntries: 4000, maxAgeSeconds: 30 * 24 * 3600 } },
            },
            {
              // The map styles, sprites and tile catalogue do change: the cached copy, refreshed behind it.
              urlPattern: /^https:\/\/tiles\.openfreemap\.org\//,
              handler: "StaleWhileRevalidate",
              options: { cacheName: "map-styles", expiration: { maxEntries: 50 } },
            },
          ],
        },
      }),
    ],
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
