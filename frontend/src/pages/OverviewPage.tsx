import { ArrowRight } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { PageContainer } from "../components/PageContainer";
import { PageHeader } from "../components/PageHeader";
import { BatteryStrip } from "../components/overview/BatteryStrip";
import { RouteSketch } from "../components/overview/RouteSketch";
import { getPlan } from "../lib/api";
import {
  averageSpeed,
  daySummaries,
  plannedAt,
  raceClock,
  timeAt,
  zoneLabel,
  type PlanResponse,
  type RaceMoment,
} from "../lib/plan";
import { loadRoute, placeName, ROUTE_URL, type RouteData } from "../lib/route";
import { useWakeLock } from "../lib/useWakeLock";

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; plan: PlanResponse };

const whole = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
const pct = (soc: number) => `${whole.format(soc * 100)}%`;

/** The race at a glance: the plan's headline numbers, where the car should be now, and links to the detail. */
export function OverviewPage() {
  useWakeLock();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [route, setRoute] = useState<RouteData>();
  const now = useNow();

  useEffect(() => {
    const abort = new AbortController();
    getPlan(abort.signal)
      .then((plan) => setLoad({ status: "ready", plan }))
      .catch((error: Error) => abort.signal.aborted || setLoad({ status: "error", message: error.message }));
    loadRoute(ROUTE_URL, abort.signal).then(setRoute, () => {}); // the sketch is optional
    return () => abort.abort();
  }, []);

  const plan = load.status === "ready" ? load.plan : undefined;

  return (
    <PageContainer>
      <PageHeader title="Race overview">{plan && <>Local time: {zoneLabel(plan)}</>}</PageHeader>

      {load.status === "loading" && <p className="text-ink-muted">Loading the plan…</p>}
      {load.status === "error" && (
        <p role="alert" className="text-risk">
          Couldn't load the plan ({load.message}).
        </p>
      )}
      {plan && <Overview plan={plan} route={route} moment={plannedAt(plan, now)} />}
    </PageContainer>
  );
}

function Overview({ plan, route, moment }: { plan: PlanResponse; route?: RouteData; moment: RaceMoment }) {
  const clock = raceClock(plan);
  const finish = plan.stops.at(-1)!;
  const days = daySummaries(plan);
  const lowestP10 = Math.min(...days.map((d) => d.minP10));
  const safe = lowestP10 >= plan.min_soc;
  const carKm = moment.phase === "racing" ? moment.km : null;

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Finish" value={clock.format(timeAt(plan, finish.km))} note={`Day ${plan.days.length} · ${placeName(finish.name)}`} />
        <Tile
          label="Distance"
          value={<>{whole.format(finish.km)} <Unit>km</Unit></>}
          note={`${plan.days.length} days · ${whole.format(averageSpeed(plan))} km/h average`}
        />
        <Tile label="Battery at the finish" value={pct(plan.soc.at(-1)!)} note={`Minimum ${pct(plan.min_soc)}`} />
        <Tile
          label="Lowest (P10)"
          value={pct(lowestP10)}
          note={safe ? "Stays above the minimum" : "Drops below the minimum"}
          risk={!safe}
        />
      </dl>

      <div className="grid gap-4 lg:grid-cols-3">
        <section aria-labelledby="now" className="flex flex-col rounded-card border border-line bg-surface p-5">
          <h2 id="now" className="text-sm text-ink-muted">
            Planned position now
          </h2>
          <Now plan={plan} moment={moment} />
          <nav aria-label="Details" className="mt-auto flex flex-wrap gap-2 pt-5">
            <Shortcut to="/plan">Full plan</Shortcut>
            <Shortcut to="/map">Map</Shortcut>
            <Shortcut to="/replan">Re-plan</Shortcut>
          </nav>
        </section>

        <section aria-label="Route" className="flex min-h-56 items-center justify-center rounded-card border border-line bg-surface p-4 lg:col-span-2">
          {route ? <RouteSketch route={route} km={carKm} /> : <p className="text-sm text-ink-muted">Loading the route…</p>}
        </section>
      </div>

      <section aria-labelledby="battery" className="rounded-card border border-line bg-surface p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="battery" className="font-display text-lg font-semibold">
            Battery along the route
          </h2>
          <p className="flex flex-wrap gap-x-4 text-xs text-ink-muted">
            <Key color="var(--battery)">Plan</Key>
            <Key color="var(--battery-band)">P10–P90</Key>
            <Key color="var(--risk)">Minimum</Key>
          </p>
        </div>
        <div className="mt-3 grid grid-cols-[auto_1fr] gap-x-2 text-xs text-ink-muted tabular-nums">
          <div className="flex flex-col justify-between text-right" aria-hidden>
            <span>100%</span>
            <span>50%</span>
            <span>0%</span>
          </div>
          <BatteryStrip plan={plan} km={carKm} />
          <ol className="col-start-2 mt-1 flex">
            {plan.days.map((d) => (
              <li key={d.day} style={{ flexGrow: d.end_km - d.start_km }} className="basis-0 truncate">
                Day {d.day}
              </li>
            ))}
          </ol>
        </div>
      </section>
    </div>
  );
}

function Now({ plan, moment }: { plan: PlanResponse; moment: RaceMoment }) {
  const clock = raceClock(plan);
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: plan.timezone, weekday: "short", day: "numeric", month: "short" });
  const [first, last] = [plan.stops[0], plan.stops.at(-1)!];

  if (moment.phase === "before")
    return <Big value={date.format(moment.start)} note={`Start at ${clock.format(moment.start)} · ${placeName(first.name)}`} />;
  if (moment.phase === "finished")
    return <Big value="Finished" note={`${date.format(moment.finish)}, ${clock.format(moment.finish)} · ${placeName(last.name)}`} />;

  const next = plan.stops.find((s) => s.km > moment.km);
  return (
    <>
      <Big value={<>km {whole.format(moment.km)}</>} note={`Day ${moment.day} · ${pct(moment.soc)} battery`} />
      {next && (
        <p className="mt-3 text-sm">
          Next: <strong>{placeName(next.name)}</strong> in {whole.format(next.km - moment.km)} km, at{" "}
          {clock.format(timeAt(plan, next.km))}
        </p>
      )}
    </>
  );
}

function Big({ value, note }: { value: ReactNode; note: string }) {
  return (
    <>
      <p className="mt-1 font-display text-4xl font-semibold tabular-nums">{value}</p>
      <p className="text-ink-muted tabular-nums">{note}</p>
    </>
  );
}

function Tile({ label, value, note, risk = false }: { label: string; value: ReactNode; note: string; risk?: boolean }) {
  return (
    <div className="rounded-card border border-line bg-surface p-4 md:p-5">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className={`font-display text-3xl font-semibold tabular-nums md:text-4xl ${risk ? "text-risk" : ""}`}>{value}</dd>
      <dd className={`text-sm ${risk ? "text-risk" : "text-ink-muted"}`}>{note}</dd>
    </div>
  );
}

const Unit = ({ children }: { children: ReactNode }) => <span className="text-xl text-ink-muted">{children}</span>;

function Key({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-4 rounded-sm" style={{ backgroundColor: color }} aria-hidden />
      {children}
    </span>
  );
}

function Shortcut({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex h-11 items-center gap-1.5 rounded-control border border-line px-4 text-sm font-medium hover:bg-surface-muted"
    >
      {children}
      <ArrowRight className="size-4" aria-hidden />
    </Link>
  );
}

/** The current time, refreshed every minute. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
