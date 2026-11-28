import type { ReactNode } from "react";
import { raceClock, stages, type PlanResponse } from "../../lib/plan";
import { placeName } from "../../lib/route";

const whole = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });

/**
 * Stop to stop: the average target speed, and when and with how much battery the car arrives.
 * On phones each row folds into a block (stage on top, its three numbers below, labelled) so
 * nothing scrolls sideways.
 */
export function StageTable({ plan }: { plan: PlanResponse }) {
  const clock = raceClock(plan);

  return (
    <div className="rounded-card border border-line bg-surface">
      <table className="w-full text-left max-sm:block">
        <thead className="border-b border-line text-sm text-ink-muted max-sm:hidden">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium md:px-5">Stage</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Target speed</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Arrive</th>
            <th scope="col" className="px-4 py-3 text-right font-medium md:px-5">Battery</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line text-2xl tabular-nums max-sm:block">
          {stages(plan).map((s) => (
            <tr key={s.toKm} className="max-sm:grid max-sm:grid-cols-3 max-sm:px-4 max-sm:py-3">
              <th scope="row" className="px-4 py-3 text-left font-normal max-sm:col-span-3 max-sm:p-0 md:px-5">
                <span className="block font-display text-xl font-semibold">
                  {placeName(s.from)} → {placeName(s.to)}
                </span>
                <span className="text-sm text-ink-muted">
                  km {whole.format(s.fromKm)}–{whole.format(s.toKm)} · {whole.format(s.toKm - s.fromKm)} km
                </span>
              </th>
              <Cell label="Speed">
                {whole.format(s.speedKmh)} <span className="text-base font-normal text-ink-muted">km/h</span>
              </Cell>
              <Cell label={`Arrive, day ${s.arrivalDay}`}>
                <span className="text-base font-normal text-ink-muted max-sm:hidden">Day {s.arrivalDay}</span>{" "}
                {clock.format(s.arrival)}
              </Cell>
              <Cell label="Battery" risk={s.arrivalSoc < plan.min_soc}>
                {whole.format(s.arrivalSoc * 100)}%
              </Cell>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A number column; on phones it carries its own label, as the header row is hidden there. */
function Cell({ label, risk = false, children }: { label: string; risk?: boolean; children: ReactNode }) {
  return (
    <td
      className={`px-4 py-3 text-right font-semibold whitespace-nowrap last:md:pr-5 max-sm:px-0 max-sm:pt-2 max-sm:pb-0 max-sm:text-left ${risk ? "text-risk" : ""}`}
    >
      <span className="block text-xs font-normal text-ink-muted sm:hidden">{label}</span>
      {children}
    </td>
  );
}
