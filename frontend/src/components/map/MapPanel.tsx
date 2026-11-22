import { Maximize2 } from "lucide-react";
import type { ReactNode } from "react";

const km = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });

/** Floating panel over the map: title and route facts. On phones it leaves the zoom buttons clear. */
export function MapPanel({
  title,
  facts,
  onFitRoute,
  children,
}: {
  title: string;
  facts?: { from: string; to: string; lengthKm: number; controlStops: number };
  onFitRoute?: () => void;
  children?: ReactNode; // status messages (loading, error)
}) {
  return (
    <section className="absolute top-3 right-14 left-3 z-10 rounded-card border border-line bg-surface/95 p-4 shadow-lg backdrop-blur md:top-4 md:right-auto md:left-4 md:w-[360px]">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-semibold tracking-tight">{title}</h1>
          {facts && (
            <p className="mt-0.5 text-sm text-ink-muted">
              {facts.from} → {facts.to} · <span className="tabular-nums">{km.format(facts.lengthKm)} km</span> ·{" "}
              {facts.controlStops} control {facts.controlStops === 1 ? "stop" : "stops"}
            </p>
          )}
        </div>
        {onFitRoute && (
          <button
            type="button"
            onClick={onFitRoute}
            aria-label="Show the whole route"
            title="Show the whole route"
            className="-mt-1 -mr-1 inline-flex size-11 shrink-0 items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
          >
            <Maximize2 className="size-4" aria-hidden />
          </button>
        )}
      </div>
      {children}
    </section>
  );
}
