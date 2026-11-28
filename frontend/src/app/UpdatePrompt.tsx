import { useEffect, useState } from "react";

const UPDATE_CHECK_MS = 60 * 60 * 1000; // a phone may keep the app open for days

/**
 * Registers the service worker (src/service-worker.js, built as sw.js) and says when the app is
 * ready offline, or when a newer version is waiting. That version starts only on "Reload".
 */
export function UpdatePrompt() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [offlineReady, setOfflineReady] = useState(false);

  useEffect(() => {
    const sw = navigator.serviceWorker;
    if (!sw) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    // With a previous version in charge, an installed worker is an update; without, the first install.
    const installed = (worker: ServiceWorker) => (sw.controller ? setWaiting(worker) : setOfflineReady(true));
    sw.register(`${import.meta.env.BASE_URL}sw.js`)
      .then((registration) => {
        if (registration.waiting && sw.controller) setWaiting(registration.waiting);
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => worker.state === "installed" && installed(worker));
        });
        timer = setInterval(() => registration.update(), UPDATE_CHECK_MS);
      })
      .catch(() => {}); // no sw.js (npm run dev): online only
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!offlineReady) return;
    const timer = setTimeout(() => setOfflineReady(false), 6000);
    return () => clearTimeout(timer);
  }, [offlineReady]);

  const reload = () => {
    navigator.serviceWorker.addEventListener("controllerchange", () => location.reload());
    waiting?.postMessage("skip-waiting");
  };

  if (!waiting && !offlineReady) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 flex items-center gap-3 rounded-card border border-line bg-surface p-3 pl-4 text-sm shadow-lg md:inset-x-auto md:right-6 md:bottom-6 md:max-w-sm"
    >
      <p className="flex-1">{waiting ? "A new version of the app is available." : "Ready to work offline."}</p>
      {waiting ? (
        <>
          <button type="button" onClick={() => setWaiting(null)} className={`${BUTTON} text-ink-muted hover:bg-surface-muted`}>
            Later
          </button>
          <button type="button" onClick={reload} className={`${BUTTON} bg-brand text-on-brand`}>
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
