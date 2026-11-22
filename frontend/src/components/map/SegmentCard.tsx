import { X } from "lucide-react";
import { nextStop, type Segment, type Stop } from "../../lib/route";

const km = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });

/** The stretch of road the user clicked: where it is and what comes next. */
export function SegmentCard({ segment, stops, onClose }: { segment: Segment; stops: Stop[]; onClose: () => void }) {
  const ahead = nextStop(stops, segment.kmEnd);

  return (
    <section
      aria-label="Selected stretch"
      className="absolute inset-x-3 bottom-3 z-10 rounded-card border border-line bg-surface/95 p-4 shadow-lg backdrop-blur md:inset-x-auto md:bottom-6 md:left-4 md:w-[360px]"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-lg font-semibold tabular-nums">
          km {km.format(segment.kmStart)}–{km.format(segment.kmEnd)}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="-mt-2 -mr-2 inline-flex size-11 items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      {ahead && (
        <p className="mt-1 text-sm text-ink-muted">
          Next: <span className="font-medium text-ink">{ahead.name}</span> in{" "}
          <span className="tabular-nums">{km.format(Math.max(0, ahead.km - segment.kmEnd))} km</span>
        </p>
      )}
    </section>
  );
}
