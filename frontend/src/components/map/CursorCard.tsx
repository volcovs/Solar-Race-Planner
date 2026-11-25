import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { dayAt, raceClock, timeAt, valueAt, type ForecastResponse, type PlanResponse } from "../../lib/plan";
import { nextStop, placeName, type Stop } from "../../lib/route";

const whole = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat("en", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

interface Props {
  km: number;
  plan: PlanResponse;
  forecast: ForecastResponse;
  stops: Stop[];
}

/** The plan and weather at the cursor, from the full data: top right on the map, across its foot on phones. */
export function CursorCard({ km, plan, forecast, stops }: Props) {
  const clock = raceClock(plan);
  const wind = valueAt(forecast.km, forecast.headwind_ms, km);
  const ahead = nextStop(stops, km);
  const p10 = valueAt(plan.km, plan.soc_p10, km);

  return (
    <section
      aria-label="At the cursor"
      className="pointer-events-none absolute inset-x-3 bottom-3 z-20 rounded-card border border-line bg-surface/95 p-3 shadow-lg backdrop-blur md:inset-x-auto md:top-4 md:right-14 md:bottom-auto md:w-60"
    >
      <h2 className="font-display text-lg font-semibold tabular-nums">km {whole.format(km)}</h2>
      <p className="text-xs text-ink-muted tabular-nums">
        Day {dayAt(plan, km)} · {clock.format(timeAt(plan, km))}
        {ahead && ahead.km > km && ` · ${placeName(ahead.name)} in ${whole.format(ahead.km - km)} km`}
      </p>
      <dl className="mt-2 grid grid-cols-[auto_1fr_auto_1fr] gap-x-3 gap-y-1 text-sm tabular-nums md:grid-cols-[auto_1fr]">
        <Row label="Battery" swatch="bg-battery">
          <span className="font-semibold">{whole.format(valueAt(plan.km, plan.soc, km) * 100)}%</span>
        </Row>
        <Row label="Speed" swatch="bg-ink">
          {whole.format(valueAt(plan.km, plan.speed_kmh, km))} km/h
        </Row>
        <Row label="Irradiance" swatch="bg-sun">
          {whole.format(valueAt(forecast.km, forecast.ghi_w_m2, km))} W/m²
        </Row>
        <Row label={wind >= 0 ? "Headwind" : "Tailwind"} swatch={wind >= 0 ? "bg-risk" : "bg-good"}>
          {oneDecimal.format(Math.abs(wind))} m/s
        </Row>
      </dl>
      {p10 < plan.min_soc && (
        <p className="mt-2 flex items-start gap-1.5 text-sm text-risk">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Low battery risk: with a worse forecast it could reach {whole.format(p10 * 100)}%, under the{" "}
            {whole.format(plan.min_soc * 100)}% minimum.
          </span>
        </p>
      )}
    </section>
  );
}

function Row({ label, swatch, children }: { label: string; swatch: string; children: ReactNode }) {
  return (
    <>
      <dt className="flex items-center gap-1.5 text-ink-muted">
        <span className={`size-2 rounded-full ${swatch}`} aria-hidden />
        {label}
      </dt>
      <dd className="text-right whitespace-nowrap">{children}</dd>
    </>
  );
}
