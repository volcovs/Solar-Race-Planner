import { useEffect } from "react";

/** Keeps the screen on while the page is shown, where the browser supports the Screen Wake Lock API. */
export function useWakeLock(): void {
  useEffect(() => {
    if (!("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | undefined;
    let active = true;
    const request = () => {
      if (document.visibilityState !== "visible") return;
      navigator.wakeLock.request("screen").then(
        (sentinel) => {
          if (active) lock = sentinel;
          else sentinel.release();
        },
        () => {}, // refused (battery saver, say): the screen just sleeps as usual
      );
    };
    // The browser releases the lock whenever the page is hidden; take it again on return.
    document.addEventListener("visibilitychange", request);
    request();
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", request);
      lock?.release();
    };
  }, []);
}
