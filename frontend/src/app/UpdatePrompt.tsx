import { useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

const UPDATE_CHECK_MS = 60 * 60 * 1000; // a phone may keep the app open for days

/**
 * Registers the service worker and reports on it: once when the app is ready to work offline,
 * and whenever a newer version has been deployed. The new version waits until "Reload", so the
 * screen never changes under someone mid-race.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (registration) setInterval(() => registration.update(), UPDATE_CHECK_MS);
    },
  });

  // "Ready offline" is good news, not a task: it goes away by itself.
  useEffect(() => {
    if (!offlineReady) return;
    const timer = setTimeout(() => setOfflineReady(false), 6000);
    return () => clearTimeout(timer);
  }, [offlineReady, setOfflineReady]);

  if (!needRefresh && !offlineReady) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 flex items-center gap-3 rounded-card border border-line bg-surface p-3 pl-4 text-sm shadow-lg md:inset-x-auto md:right-6 md:bottom-6 md:max-w-sm"
    >
      <p className="flex-1">{needRefresh ? "A new version of the app is available." : "Ready to work offline."}</p>
      {needRefresh ? (
        <>
          <button type="button" onClick={() => setNeedRefresh(false)} className={`${BUTTON} text-ink-muted hover:bg-surface-muted`}>
            Later
          </button>
          <button type="button" onClick={() => updateServiceWorker(true)} className={`${BUTTON} bg-sun text-on-sun`}>
            Reload
          </button>
        </>
      ) : (
        <button type="button" onClick={() => setOfflineReady(false)} className={`${BUTTON} text-ink-muted hover:bg-surface-muted`}>
          OK
        </button>
      )}
    </div>
  );
}

const BUTTON = "h-11 shrink-0 rounded-control px-4 font-medium";
