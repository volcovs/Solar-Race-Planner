import { useCallback, useEffect, useState } from "react";
import { CursorCard } from "../components/map/CursorCard";
import { MapPanel } from "../components/map/MapPanel";
import { RouteMap } from "../components/map/RouteMap";
import { SegmentCard } from "../components/map/SegmentCard";
import type { Cursor } from "../components/timeline/RaceTimeline";
import { TimelinePanel, type TimelineLoad } from "../components/timeline/TimelinePanel";
import { getForecast, getPlan } from "../lib/api";
import { loadRoute, ROUTE_URL, segmentAtKm, type RouteData, type Stop } from "../lib/route";
import { useDocumentTitle } from "../lib/useDocumentTitle";

const NO_STOPS: Stop[] = []; // one array, so the timeline doesn't redraw on every render

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; route: RouteData };

/** The route map (Google Maps style, panels float on top) with the race timeline docked below. */
export function MapPage() {
  useDocumentTitle("Route map");
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [timeline, setTimeline] = useState<TimelineLoad>({ status: "loading" });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [cursor, setCursor] = useState<Cursor>(null);

  useEffect(() => {
    const abort = new AbortController();
    loadRoute(ROUTE_URL, abort.signal)
      .then((route) => setLoad({ status: "ready", route }))
      .catch((error: Error) => abort.signal.aborted || setLoad({ status: "error", message: error.message }));
    Promise.all([getPlan(abort.signal), getForecast(abort.signal)])
      .then(([plan, forecast]) => setTimeline({ status: "ready", plan, forecast }))
      .catch((error: Error) => abort.signal.aborted || setTimeline({ status: "error", message: error.message }));
    return () => abort.abort();
  }, []);

  const route = load.status === "ready" ? load.route : undefined;
  const selected = route && selectedId !== null ? route.segments[selectedId] : undefined;

  const fromMap = useCallback((km: number | null) => setCursor(km === null ? null : { km, from: "map" }), []);
  const fromTimeline = useCallback((km: number | null) => setCursor(km === null ? null : { km, from: "timeline" }), []);
  const pick = useCallback((km: number) => route && setSelectedId(segmentAtKm(route, km)?.id ?? null), [route]);

  return (
    <div className="flex flex-1 flex-col">
      <div className="relative min-h-[320px] flex-1 overflow-hidden bg-surface-muted">
        {route && (
          <RouteMap
            route={route}
            selectedId={selectedId}
            onSelect={setSelectedId}
            cursorKm={cursor?.km ?? null}
            onCursor={fromMap}
          />
        )}

        <MapPanel route={route}>
          {load.status === "loading" && <p className="mt-3 text-sm text-ink-muted">Loading the route…</p>}
          {load.status === "error" && (
            <p role="alert" className="mt-3 text-sm text-risk">
              Couldn't load the route ({load.message}).
            </p>
          )}
        </MapPanel>

        {route && selected && <SegmentCard segment={selected} stops={route.stops} onClose={() => setSelectedId(null)} />}
        {route && cursor && timeline.status === "ready" && (
          <CursorCard km={cursor.km} plan={timeline.plan} forecast={timeline.forecast} stops={route.stops} />
        )}
      </div>

      <TimelinePanel load={timeline} stops={route?.stops ?? NO_STOPS} cursor={cursor} onCursor={fromTimeline} onPick={pick} />
    </div>
  );
}
