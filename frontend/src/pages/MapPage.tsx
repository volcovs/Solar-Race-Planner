import { useEffect, useRef, useState } from "react";
import { MapPanel } from "../components/map/MapPanel";
import { RouteMap, type RouteMapHandle } from "../components/map/RouteMap";
import { SegmentCard } from "../components/map/SegmentCard";
import { loadRoute, placeName, type RouteData } from "../lib/route";
import { useDocumentTitle } from "../lib/useDocumentTitle";

// Until the API serves the route (BE-04): the file exported by the route pipeline (DAT-01).
const ROUTE_URL = `${import.meta.env.BASE_URL}sample/route.geojson`;

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; route: RouteData };

/** Full-screen route map (Google Maps style): the map fills the page, panels float on top. */
export function MapPage() {
  useDocumentTitle("Route map");
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const map = useRef<RouteMapHandle>(null);

  useEffect(() => {
    const abort = new AbortController();
    loadRoute(ROUTE_URL, abort.signal)
      .then((route) => setLoad({ status: "ready", route }))
      .catch((error: Error) => {
        if (!abort.signal.aborted) setLoad({ status: "error", message: error.message });
      });
    return () => abort.abort();
  }, []);

  const route = load.status === "ready" ? load.route : undefined;
  const selected = route && selectedId !== null ? route.segments[selectedId] : undefined;
  const start = route?.stops.find((s) => s.kind === "start");
  const finish = route?.stops.find((s) => s.kind === "finish");

  return (
    <div className="relative min-h-[480px] flex-1 overflow-hidden bg-surface-muted">
      {route && <RouteMap ref={map} route={route} selectedId={selectedId} onSelect={setSelectedId} />}

      <MapPanel
        title="Route map"
        facts={
          route && start && finish
            ? {
                from: placeName(start.name),
                to: placeName(finish.name),
                lengthKm: route.lengthKm,
                controlStops: route.stops.filter((s) => s.kind === "control_stop").length,
              }
            : undefined
        }
        onFitRoute={route ? () => map.current?.fitRoute() : undefined}
      >
        {load.status === "loading" && <p className="mt-3 text-sm text-ink-muted">Loading the route…</p>}
        {load.status === "error" && (
          <p role="alert" className="mt-3 text-sm text-risk">
            Couldn't load the route ({load.message}).
          </p>
        )}
      </MapPanel>

      {route && selected && <SegmentCard segment={selected} stops={route.stops} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
