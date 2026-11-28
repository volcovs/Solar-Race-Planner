import { X } from "lucide-react";
import { useId } from "react";
import type { Scenario } from "../../lib/plan";

const signedPct = (n: number) => (n === 0 ? "as profile" : `${n > 0 ? "+" : "−"}${Math.abs(n)}%`);

/** One scenario's settings: start battery, cloud timing, forecast, drag and speed strategy. */
export function ScenarioControls({
  name,
  scenario,
  onChange,
  onRemove,
}: {
  name: string;
  scenario: Scenario;
  onChange: (scenario: Scenario) => void;
  onRemove?: () => void;
}) {
  const set = <K extends keyof Scenario>(key: K, value: Scenario[K]) => onChange({ ...scenario, [key]: value });
  const shift = scenario.weather_shift_h;

  return (
    <fieldset className="rounded-card border border-line bg-surface p-5">
      <div className="flex min-h-11 items-center justify-between">
        <legend className="font-display text-xl font-semibold">{name}</legend>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${name}`}
            className="-mr-2 inline-flex size-11 items-center justify-center rounded-control text-ink-muted hover:bg-surface-muted hover:text-ink"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>

      <div className="mt-2 space-y-4">
        <Slider
          label="Start battery"
          value={`${Math.round(scenario.start_soc * 100)}%`}
          min={20}
          max={100}
          step={5}
          current={Math.round(scenario.start_soc * 100)}
          onChange={(v) => set("start_soc", v / 100)}
        />
        <Slider
          label="Clouds"
          value={shift === 0 ? "as forecast" : `${Math.abs(shift * 60)} min ${shift < 0 ? "earlier" : "later"}`}
          min={-60}
          max={60}
          step={30}
          current={shift * 60}
          onChange={(v) => set("weather_shift_h", v / 60)}
        />
        <Choice
          label="Forecast"
          value={scenario.weather}
          options={[
            ["p10", "P10", "Pessimistic"],
            ["p50", "P50", "Median"],
            ["p90", "P90", "Optimistic"],
          ]}
          onChange={(v) => set("weather", v)}
        />
        <Slider
          label="Drag (CdA)"
          value={signedPct(Math.round((scenario.cda_factor - 1) * 100))}
          min={90}
          max={110}
          step={5}
          current={Math.round(scenario.cda_factor * 100)}
          onChange={(v) => set("cda_factor", v / 100)}
        />
        <Choice
          label="Speed"
          value={scenario.strategy}
          options={[
            ["planned", "Planned", "Varies with wind and battery"],
            ["constant", "Constant", "Same average, held all race"],
          ]}
          onChange={(v) => set("strategy", v)}
        />
      </div>
    </fieldset>
  );
}

function Slider(props: {
  label: string;
  value: string;
  min: number;
  max: number;
  step: number;
  current: number;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm text-ink-muted">
          {props.label}
        </label>
        <span className="font-display text-lg font-semibold tabular-nums">{props.value}</span>
      </div>
      <input
        id={id}
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.current}
        aria-valuetext={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="h-11 w-full accent-brand"
      />
    </div>
  );
}

/** A segmented choice (radio buttons that look like a button row), with the chosen option's hint under it. */
function Choice<T extends string>(props: {
  label: string;
  value: T;
  options: [T, string, string][]; // value, label, hint
  onChange: (value: T) => void;
}) {
  const name = useId();
  return (
    <div role="radiogroup" aria-label={props.label}>
      <p className="text-sm text-ink-muted">{props.label}</p>
      <div className="mt-1 grid auto-cols-fr grid-flow-col gap-1 rounded-control bg-surface-muted p-1">
        {props.options.map(([value, label]) => (
          <label
            key={value}
            className={`flex min-h-11 cursor-pointer items-center justify-center rounded-[8px] px-2 text-sm font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus ${
              props.value === value ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={value}
              checked={props.value === value}
              onChange={() => props.onChange(value)}
              className="sr-only"
            />
            {label}
          </label>
        ))}
      </div>
      <p className="mt-1 text-xs text-ink-muted">{props.options.find(([value]) => value === props.value)?.[2]}</p>
    </div>
  );
}
