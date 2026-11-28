import { Clock, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { getForecast } from "../lib/api";
import { useOnline } from "../lib/useOnline";

/** Older than this, the forecast is worth a warning even with signal. */
const STALE_HOURS = 6;

const relative = new Intl.RelativeTimeFormat("en");

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_557_600],
  ["month", 2_629_800],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];

/** "5 minutes ago", "28 hours ago", "15 months ago": the largest unit there are at least two of. */
export function age(from: Date, now = new Date()): string {
  const seconds = (from.getTime() - now.getTime()) / 1000;
  const [unit, size] = UNITS.find(([, size]) => Math.abs(seconds) >= 2 * size) ?? UNITS[UNITS.length - 1];
  return relative.format(Math.round(seconds / size), unit);
}

/** Says when the app is offline, and the forecast's age when offline or old; otherwise hidden. */
export function DataBanner() {
  const online = useOnline();
  const [issued, setIssued] = useState<Date | null>();

  useEffect(() => {
    let active = true;
    getForecast()
      .then((f) => active && setIssued(new Date(f.issue_time_utc)))
      .catch(() => active && setIssued(null));
    return () => {
      active = false;
    };
  }, [online]);

  const hours = issued ? (Date.now() - issued.getTime()) / 3_600_000 : 0;
  if (online && !(issued && hours > STALE_HOURS)) return null;

  const forecast =
    issued === undefined ? "" : issued === null ? "No forecast saved on this device yet." : `Forecast issued ${age(issued)}.`;

  return (
    <aside
      aria-label="Data status"
      className={`flex items-center gap-2 border-b px-4 py-2 text-sm md:px-6 ${
        online ? "border-line bg-surface-muted text-ink" : "border-sun-band bg-sun-band text-sun-ink"
      }`}
    >
      {online ? <Clock className="size-4 shrink-0" aria-hidden /> : <WifiOff className="size-4 shrink-0" aria-hidden />}
      <p>
        {online ? (
          <>
            {forecast} <span className="text-ink-muted">It may be out of date.</span>
          </>
        ) : (
          <>
            <span className="font-semibold">Offline.</span> Showing what this device saved. {forecast}
          </>
        )}
      </p>
    </aside>
  );
}
