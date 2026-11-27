import type { ReactNode } from "react";
import { compareStops, dayAt, lowestSocFrom, raceClock, timeAt, type PlanResponse } from "../../lib/plan";
import { placeName } from "../../lib/route";
import { Delta, duration, pts } from "../Delta";

const whole = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
const pct = (soc: number) => `${whole.format(soc * 100)}%`;

/** The new plan against the previous one: the headline numbers, then stop by stop. */
export function PlanDiff({ before, after }: { before: PlanResponse; after: PlanResponse }) {
  const clock = raceClock(after);
  const at = (plan: PlanResponse, km: number) => `Day ${dayAt(plan, km)} · ${clock.format(timeAt(plan, km))}`;
  const from = after.km[0];
  const finish = after.stops[after.stops.length - 1];
  const minutes = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 60_000;
  const points = (a: number, b: number) => (b - a) * 100;
  const lowestBefore = lowestSocFrom(before, from);
  const lowestAfter = lowestSocFrom(after, from);
  const finishSoc = { before: before.soc[before.soc.length - 1], after: after.soc[after.soc.length - 1] };

  return (
    <section aria-labelledby="diff" className="mt-10">
      <h2 id="diff" className="mb-4 font-display text-2xl font-semibold">
        New plan vs previous
      </h2>

      <dl className="grid gap-4 sm:grid-cols-3">
        <Headline label={`Arrive ${placeName(finish.name)}`} value={at(after, finish.km)} was={at(before, finish.km)}>
          <Delta change={minutes(timeAt(before, finish.km), timeAt(after, finish.km))} format={duration} worse="up" />
        </Headline>
        <Headline label="Battery at the finish" value={pct(finishSoc.after)} was={pct(finishSoc.before)}>
          <Delta change={points(finishSoc.before, finishSoc.after)} format={pts} worse="down" />
        </Headline>
        <Headline
          label="Lowest battery ahead"
          value={pct(lowestAfter)}
          was={pct(lowestBefore)}
          risk={lowestAfter < after.min_soc}
        >
          <Delta change={points(lowestBefore, lowestAfter)} format={pts} worse="down" />
        </Headline>
      </dl>

      <div className="mt-6 overflow-x-auto rounded-card border border-line bg-surface">
        <table className="w-full text-left">
          <thead className="border-b border-line text-sm text-ink-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium md:px-5">Stop</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Arrive</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Battery</th>
              <th scope="col" className="px-4 py-3 text-right font-medium md:px-5">Speed there</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line tabular-nums">
            {compareStops(before, after).map((c) => (
              <tr key={c.km}>
                <th scope="row" className="px-4 py-3 font-display text-xl font-semibold md:px-5">
                  {placeName(c.name)}
                  <span className="block font-sans text-sm font-normal text-ink-muted">km {whole.format(c.km)}</span>
                </th>
                <Cell
                  value={
                    <>
                      <span className="text-base font-normal text-ink-muted">Day {dayAt(after, c.km)}</span>{" "}
                      {clock.format(c.arrival.after)}
                    </>
                  }
                >
                  <Delta change={minutes(c.arrival.before, c.arrival.after)} format={duration} worse="up" />
                </Cell>
                <Cell value={pct(c.soc.after)} risk={c.soc.after < after.min_soc}>
                  <Delta change={points(c.soc.before, c.soc.after)} format={pts} worse="down" />
                </Cell>
                <Cell value={`${whole.format(c.speedKmh.after)} km/h`}>
                  <Delta change={c.speedKmh.after - c.speedKmh.before} format={(n) => `${n} km/h`} />
                </Cell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Headline({ label, value, was, risk = false, children }: { label: string; value: string; was: string; risk?: boolean; children: ReactNode }) {
  return (
    <div className="rounded-card border border-line bg-surface p-5">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className={`font-display text-4xl leading-tight font-semibold tabular-nums ${risk ? "text-risk" : ""}`}>{value}</dd>
      <dd className="text-sm tabular-nums">
        {children} <span className="text-ink-muted">(was {was})</span>
      </dd>
    </div>
  );
}

function Cell({ value, risk = false, children }: { value: ReactNode; risk?: boolean; children: ReactNode }) {
  return (
    <td className="px-4 py-3 text-right whitespace-nowrap last:md:pr-5">
      <span className={`block text-2xl font-semibold ${risk ? "text-risk" : ""}`}>{value}</span>
      <span className="text-sm">{children}</span>
    </td>
  );
}
