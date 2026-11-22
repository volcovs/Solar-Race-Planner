import { useEffect, useState } from "react";
import { getHealth } from "../lib/api";

type ApiStatus = { state: "checking" } | { state: "online"; version: string } | { state: "offline" };

const DOT: Record<ApiStatus["state"], string> = {
  checking: "bg-ink-muted",
  online: "bg-good",
  offline: "bg-risk",
};

/** Shows whether the API answers; checks on load and then every `intervalMs`. */
export function StatusPill({ intervalMs = 60_000 }: { intervalMs?: number }) {
  const [status, setStatus] = useState<ApiStatus>({ state: "checking" });

  useEffect(() => {
    let active = true;
    const check = () =>
      getHealth()
        .then((health) => active && setStatus({ state: "online", version: health.version }))
        .catch(() => active && setStatus({ state: "offline" }));

    check();
    const timer = setInterval(check, intervalMs);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [intervalMs]);

  const text =
    status.state === "online" ? `API online · v${status.version}` : status.state === "offline" ? "API offline" : "Checking API…";

  return (
    <span
      role="status"
      className="inline-flex h-9 items-center gap-2 rounded-full border border-line bg-surface px-3 text-sm text-ink-muted"
    >
      <span className={`size-2 rounded-full ${DOT[status.state]}`} aria-hidden />
      <span className="tabular-nums">{text}</span>
    </span>
  );
}
