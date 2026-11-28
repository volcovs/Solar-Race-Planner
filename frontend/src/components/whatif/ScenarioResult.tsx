import type { ReactNode } from "react";
import { averageSpeed, dayAt, daySummaries, raceClock, timeAt, type PlanResponse } from "../../lib/plan";
import { Delta, duration, pts } from "../Delta";

const whole = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
const pct = (soc: number) => `${whole.format(soc * 100)}%`;

/** A scenario's plan in five numbers, each compared with the baseline's (none for the baseline itself). */
export function ScenarioResult({ plan, baseline }: { plan: PlanResponse; baseline?: PlanResponse }) {
  const end = plan.km[plan.km.length - 1];
  const finish = timeAt(plan, end);
  const lowest = Math.min(...plan.soc);
  const riskyDays = daySummaries(plan).filter((d) => !d.safe).length;
  const base = baseline && {
    finish: timeAt(baseline, baseline.km[baseline.km.length - 1]),
    soc: baseline.soc[baseline.soc.length - 1],
    lowest: Math.min(...baseline.soc),
    speed: averageSpeed(baseline),
  };

  return (
    <dl className="mt-4 space-y-3 rounded-card border border-line bg-surface p-5">
      <Row label="Finish" value={`Day ${dayAt(plan, end)} · ${raceClock(plan).format(finish)}`}>
        {base && <Delta change={(finish.getTime() - base.finish.getTime()) / 60_000} format={duration} worse="up" />}
      </Row>
      <Row label="Battery at the finish" value={pct(plan.soc[plan.soc.length - 1])}>
        {base && <Delta change={(plan.soc[plan.soc.length - 1] - base.soc) * 100} format={pts} worse="down" />}
      </Row>
      <Row label="Lowest battery" value={pct(lowest)} risk={lowest < plan.min_soc}>
        {base && <Delta change={(lowest - base.lowest) * 100} format={pts} worse="down" />}
      </Row>
      <Row label="Average speed" value={`${whole.format(averageSpeed(plan))} km/h`}>
        {base && <Delta change={averageSpeed(plan) - base.speed} format={(n) => `${n} km/h`} />}
      </Row>
      <Row
        label="Pessimistic case (P10)"
        value={riskyDays === 0 ? "Safe all race" : `Below ${pct(plan.min_soc)} on ${riskyDays} ${riskyDays === 1 ? "day" : "days"}`}
        risk={riskyDays > 0}
        small
      />
      {!baseline && <p className="text-sm text-ink-muted">The others are compared with this one.</p>}
    </dl>
  );
}

function Row({
  label,
  value,
  risk = false,
  small = false,
  children,
}: {
  label: string;
  value: string;
  risk?: boolean;
  small?: boolean;
  children?: ReactNode;
}) {
  return (
    <div>
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="flex flex-wrap items-baseline gap-x-2 tabular-nums">
        <span className={`font-display font-semibold ${small ? "text-lg" : "text-3xl"} ${risk ? "text-risk" : ""}`}>{value}</span>
        {children && <span className="text-sm">{children}</span>}
      </dd>
    </div>
  );
}
