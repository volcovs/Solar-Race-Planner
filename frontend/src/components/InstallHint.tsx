import { Share, X } from "lucide-react";
import { useState } from "react";

const DISMISSED_KEY = "srp-install-hint-dismissed";

/** iPhone Safari has no install prompt: tell people how to add the app to the home screen. */
export function InstallHint() {
  const [show, setShow] = useState(() => isIos() && !isInstalled() && !dismissed());
  if (!show) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Storage blocked: the hint just comes back next visit.
    }
    setShow(false);
  };

  return (
    <aside aria-label="Install" className="flex items-center gap-2 border-b border-line bg-brand-band py-1 pr-1 pl-4 text-sm text-brand-ink">
      <p>
        Install: tap <Share className="inline size-4 align-text-bottom" aria-label="Share" /> then{" "}
        <span className="font-medium">Add to Home Screen</span>.
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Hide this tip"
        className="ml-auto inline-flex size-11 shrink-0 items-center justify-center rounded-control"
      >
        <X className="size-4" aria-hidden />
      </button>
    </aside>
  );
}

// iPads report themselves as Macs; a Mac with a touch screen is an iPad.
const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Mac") && navigator.maxTouchPoints > 1);

const isInstalled = () =>
  (navigator as Navigator & { standalone?: boolean }).standalone === true ||
  matchMedia("(display-mode: standalone)").matches;

function dismissed() {
  try {
    return localStorage.getItem(DISMISSED_KEY) !== null;
  } catch {
    return false;
  }
}
