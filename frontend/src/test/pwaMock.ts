// Stand-in for vite-plugin-pwa's virtual:pwa-register/react: jsdom has no service workers.
// Tests set `pwa.needRefresh` / `pwa.offlineReady` before rendering and check `updateServiceWorker`.
import { useState } from "react";
import { vi } from "vitest";

export const pwa = { needRefresh: false, offlineReady: false, updateServiceWorker: vi.fn() };

export function useRegisterSW() {
  const needRefresh = useState(pwa.needRefresh);
  const offlineReady = useState(pwa.offlineReady);
  return { needRefresh, offlineReady, updateServiceWorker: pwa.updateServiceWorker };
}
