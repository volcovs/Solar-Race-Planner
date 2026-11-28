import { sample, type PlanResponse } from "../../lib/plan";

const W = 600;
const H = 140;
const POINTS = 300;

/** Planned battery along the route: the plan's line, its P10–P90 band, the minimum, and "now". */
export function BatteryStrip({ plan, km }: { plan: PlanResponse; km: number | null }) {
  const total = plan.km[plan.km.length - 1];
  const step = total / POINTS;
  const x = (k: number) => (k / total) * W;
  const y = (soc: number) => (1 - soc) * H;
  const line = (values: number[]) => sample(plan.km, values, step).map(([k, v]) => `${x(k)},${y(v)}`);
  const band = [...line(plan.soc_p90), ...line(plan.soc_p10).reverse()].join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-36 w-full" aria-hidden>
      {plan.days.slice(1).map((d) => (
        <line key={d.day} x1={x(d.start_km)} x2={x(d.start_km)} y1={0} y2={H} stroke="var(--line)" vectorEffect="non-scaling-stroke" />
      ))}
      <polygon points={band} fill="var(--battery-band)" />
      <line x1={0} x2={W} y1={y(plan.min_soc)} y2={y(plan.min_soc)} stroke="var(--risk)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
      <polyline points={line(plan.soc).join(" ")} fill="none" stroke="var(--battery)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      {km !== null && <line x1={x(km)} x2={x(km)} y1={0} y2={H} stroke="var(--brand)" strokeWidth={2} vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}
