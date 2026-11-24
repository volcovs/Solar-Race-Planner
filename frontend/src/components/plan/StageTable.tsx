import { raceClock, stages, type PlanResponse } from "../../lib/plan";
import { placeName } from "../../lib/route";

const whole = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });

/** Stop to stop: the average target speed, and when and with how much battery the car arrives. */
export function StageTable({ plan }: { plan: PlanResponse }) {
  const clock = raceClock(plan);

  return (
    <div className="overflow-x-auto rounded-card border border-line bg-surface">
      <table className="w-full min-w-[560px] text-left">
        <thead className="border-b border-line text-sm text-ink-muted">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium md:px-5">Stage</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Target speed</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Arrive</th>
            <th scope="col" className="px-4 py-3 text-right font-medium md:px-5">Battery</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line text-2xl tabular-nums">
          {stages(plan).map((s) => (
            <tr key={s.toKm}>
              <th scope="row" className="px-4 py-3 text-left font-normal md:px-5">
                <span className="block font-display text-xl font-semibold">
                  {placeName(s.from)} → {placeName(s.to)}
                </span>
                <span className="text-sm text-ink-muted">
                  km {whole.format(s.fromKm)}–{whole.format(s.toKm)} · {whole.format(s.toKm - s.fromKm)} km
                </span>
              </th>
              <td className="px-4 py-3 text-right font-semibold">
                {whole.format(s.speedKmh)} <span className="text-base font-normal text-ink-muted">km/h</span>
              </td>
              <td className="px-4 py-3 text-right whitespace-nowrap">
                <span className="text-base text-ink-muted">Day {s.arrivalDay}</span>{" "}
                <span className="font-semibold">{clock.format(s.arrival)}</span>
              </td>
              <td className={`px-4 py-3 text-right font-semibold md:px-5 ${s.arrivalSoc < plan.min_soc ? "text-risk" : ""}`}>
                {whole.format(s.arrivalSoc * 100)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
