import type { ReactNode } from "react";
import { placeName, type RouteData } from "../../lib/route";

const km = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });

/** Floating panel over the map: title and route facts. On phones it leaves the zoom buttons clear. */
export function MapPanel({ route, children }: { route?: RouteData; children?: ReactNode }) {
  const start = route?.stops.find((s) => s.kind === "start");
  const finish = route?.stops.find((s) => s.kind === "finish");
  const controlStops = route?.stops.filter((s) => s.kind === "control_stop").length ?? 0;

  return (
    <section className="absolute top-3 right-14 left-3 z-10 max-h-[calc(100%-1.5rem)] overflow-y-auto rounded-card border border-line bg-surface/95 p-4 shadow-lg backdrop-blur md:top-4 md:right-auto md:left-4 md:w-[360px]">
      <h1 className="font-display text-xl font-semibold tracking-tight">Route map</h1>
      {route && start && finish && (
        <p className="mt-0.5 text-sm text-ink-muted">
          {placeName(start.name)} → {placeName(finish.name)} ·{" "}
          <span className="tabular-nums">{km.format(route.lengthKm)} km</span> · {controlStops} control{" "}
          {controlStops === 1 ? "stop" : "stops"}
        </p>
      )}
      {children}
    </section>
  );
}
