import { ShieldAlert, ShieldCheck } from "lucide-react";
import { daySummaries, raceClock, type PlanResponse } from "../../lib/plan";
import { placeName } from "../../lib/route";

const whole = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
const pct = (soc: number) => `${whole.format(soc * 100)}%`;

/** One card per race day: where it ends, the lowest battery, and whether the pessimistic case stays safe. */
export function DayCards({ plan }: { plan: PlanResponse }) {
  const clock = raceClock(plan);
  const lastDay = plan.days.length;
  const finish = plan.stops.at(-1);

  return (
    <ol className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {daySummaries(plan).map((d) => {
        const ahead = d.day === lastDay ? undefined : plan.stops.find((s) => s.km > d.endKm);
        return (
          <li key={d.day} className="rounded-card border border-line bg-surface p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-display text-xl font-semibold">Day {d.day}</h3>
              <SafeBadge safe={d.safe} minP10={d.minP10} minSoc={plan.min_soc} />
            </div>

            <p className="mt-4 text-sm text-ink-muted">{d.day === lastDay ? "Finish" : "End of day"}</p>
            <p className="font-display text-5xl leading-tight font-semibold tabular-nums">
              {/* The finish by its official km, as the stage table gives it */}
              {whole.format(d.day === lastDay && finish ? finish.km : d.endKm)} <span className="text-2xl text-ink-muted">km</span>
            </p>
            <p className="text-ink-muted tabular-nums">
              {clock.format(d.endTime)}
              {ahead && ` · ${whole.format(ahead.km - d.endKm)} km before ${placeName(ahead.name)}`}
              {d.day === lastDay && finish && ` · ${placeName(finish.name)}`}
            </p>

            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4">
              <div>
                <dt className="text-sm text-ink-muted">Lowest battery</dt>
                <dd className="font-display text-3xl font-semibold tabular-nums">{pct(d.minSoc)}</dd>
              </div>
              <div>
                <dt className="text-sm text-ink-muted">Pessimistic (P10)</dt>
                <dd className={`font-display text-3xl font-semibold tabular-nums ${d.safe ? "" : "text-risk"}`}>
                  {pct(d.minP10)}
                </dd>
              </div>
            </dl>
          </li>
        );
      })}
    </ol>
  );
}

function SafeBadge({ safe, minP10, minSoc }: { safe: boolean; minP10: number; minSoc: number }) {
  const Icon = safe ? ShieldCheck : ShieldAlert;
  return (
    <span
      title={`Pessimistic battery stays ${safe ? "at or above" : "below"} the ${pct(minSoc)} minimum (lowest ${pct(minP10)})`}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-medium ${
        safe ? "border-good text-good" : "border-risk text-risk"
      }`}
    >
      <Icon className="size-4" aria-hidden />
      {safe ? "Safe under P10" : `Below ${pct(minSoc)} under P10`}
    </span>
  );
}
