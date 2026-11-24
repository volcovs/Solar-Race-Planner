import { ChevronDown } from "lucide-react";
import { lazy, Suspense, useId, useState } from "react";
import type { ForecastResponse, PlanResponse } from "../../lib/plan";
import type { Stop } from "../../lib/route";
import type { Cursor } from "./RaceTimeline";

// The chart library is large; load it alongside the map's.
const RaceTimeline = lazy(() => import("./RaceTimeline").then((m) => ({ default: m.RaceTimeline })));

export type TimelineLoad =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; plan: PlanResponse; forecast: ForecastResponse };

interface Props {
  load: TimelineLoad;
  stops: Stop[];
  cursor: Cursor;
  onCursor: (km: number | null) => void;
  onPick: (km: number) => void;
}

/** Docked under the map; can be hidden to give the map the room. */
export function TimelinePanel({ load, stops, cursor, onCursor, onPick }: Props) {
  const [open, setOpen] = useState(true);
  const id = useId();

  return (
    <section aria-labelledby={`${id}-title`} className="border-t border-line bg-surface">
      <div className="flex min-h-12 items-center px-4 md:px-6">
        <h2 id={`${id}-title`} className="font-display text-base font-semibold">
          Race timeline
        </h2>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls={id}
          aria-label={open ? "Hide the timeline" : "Show the timeline"}
          className="ml-auto inline-flex size-11 items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
        >
          <ChevronDown className={`size-4 transition-transform ${open ? "" : "rotate-180"}`} aria-hidden />
        </button>
      </div>

      <div id={id} hidden={!open} className="h-[min(46vh,380px)] min-h-[300px] px-4 pb-3 md:px-6">
        {load.status === "loading" && <p className="text-sm text-ink-muted">Loading the plan…</p>}
        {load.status === "error" && (
          <p role="alert" className="text-sm text-risk">
            Couldn't load the plan ({load.message}).
          </p>
        )}
        {load.status === "ready" && (
          <Suspense fallback={null}>
            <RaceTimeline
              plan={load.plan}
              forecast={load.forecast}
              stops={stops}
              cursor={cursor}
              onCursor={onCursor}
              onPick={onPick}
            />
          </Suspense>
        )}
      </div>
    </section>
  );
}
