import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { PageContainer } from "../components/PageContainer";
import { PageHeader } from "../components/PageHeader";
import { PlanDiff } from "../components/replan/PlanDiff";
import { getPlan, replan } from "../lib/api";
import { raceTimeToUtc, zoneLabel, type PlanResponse, type ReplanRequest } from "../lib/plan";

interface Fields {
  km: string;
  day: string;
  clock: string; // "HH:MM", local race time
  soc: string; // percent
}

type Errors = Partial<Record<keyof Fields, string>>;

type Run = { status: "idle" } | { status: "running" } | { status: "error"; message: string } | { status: "done"; plan: PlanResponse };

const whole = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });

/** Where the car is now (km, clock, battery) → a new plan to the finish, compared with the previous one. */
export function ReplanPage() {
  const [plan, setPlan] = useState<PlanResponse>();
  const [loadError, setLoadError] = useState<string>();
  const [fields, setFields] = useState<Fields>({ km: "", day: "1", clock: "", soc: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [run, setRun] = useState<Run>({ status: "idle" });

  useEffect(() => {
    const abort = new AbortController();
    getPlan(abort.signal)
      .then(setPlan)
      .catch((error: Error) => abort.signal.aborted || setLoadError(error.message));
    return () => abort.abort();
  }, []);

  const set = (name: keyof Fields) => (value: string) => setFields((f) => ({ ...f, [name]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!plan) return;
    const { request, errors } = check(fields, plan);
    setErrors(errors);
    if (!request) return;
    setRun({ status: "running" });
    try {
      setRun({ status: "done", plan: await replan(request) });
    } catch (error) {
      setRun({ status: "error", message: (error as Error).message });
    }
  };

  return (
    <PageContainer>
      <PageHeader title="Re-plan from here">{plan && <>Local time: {zoneLabel(plan)}</>}</PageHeader>

      {loadError && (
        <p role="alert" className="text-risk">
          Couldn't load the current plan ({loadError}).
        </p>
      )}

      {plan && (
        <form onSubmit={submit} noValidate className="max-w-3xl rounded-card border border-line bg-surface p-5">
          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Position, km" error={errors.km}>
              {(props) => (
                <input {...props} type="number" inputMode="decimal" value={fields.km} onChange={(e) => set("km")(e.target.value)} />
              )}
            </Field>
            <Field label="Time" error={errors.clock}>
              {(props) => (
                <div className="flex gap-2">
                  <select
                    aria-label="Race day"
                    value={fields.day}
                    onChange={(e) => set("day")(e.target.value)}
                    className={`${INPUT} w-auto text-lg`}
                  >
                    {plan.days.map((d) => (
                      <option key={d.day} value={d.day}>
                        Day {d.day}
                      </option>
                    ))}
                  </select>
                  <input {...props} type="time" value={fields.clock} onChange={(e) => set("clock")(e.target.value)} />
                </div>
              )}
            </Field>
            <Field label="Battery, %" error={errors.soc}>
              {(props) => (
                <input {...props} type="number" inputMode="decimal" value={fields.soc} onChange={(e) => set("soc")(e.target.value)} />
              )}
            </Field>
          </div>

          <button
            type="submit"
            disabled={run.status === "running"}
            className="mt-5 inline-flex h-12 items-center rounded-control bg-sun px-6 font-medium text-on-sun disabled:opacity-60"
          >
            {run.status === "running" ? "Re-planning…" : "Re-plan"}
          </button>
          {run.status === "error" && (
            <p role="alert" className="mt-3 text-risk">
              Couldn't re-plan ({run.message}).
            </p>
          )}
        </form>
      )}

      {plan && run.status === "done" && <PlanDiff before={plan} after={run.plan} />}
    </PageContainer>
  );
}

const INPUT =
  "h-12 w-full min-w-0 rounded-control border border-line bg-surface px-3 font-display text-2xl font-semibold tabular-nums aria-invalid:border-risk";

/** A labelled input with its error under it; the render prop gets the id and aria wiring. */
function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: (props: { id: string; className: string; "aria-invalid": boolean; "aria-describedby"?: string }) => ReactNode;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm text-ink-muted">
        {label}
      </label>
      {children({ id, className: INPUT, "aria-invalid": !!error, "aria-describedby": error ? `${id}-error` : undefined })}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-risk">
          {error}
        </p>
      )}
    </div>
  );
}

/** Validate before calling the API: km on the route, a time within the race, battery 0–100%. */
function check(fields: Fields, plan: PlanResponse): { request?: ReplanRequest; errors: Errors } {
  const errors: Errors = {};
  const endKm = plan.km[plan.km.length - 1];
  const km = Number(fields.km);
  const soc = Number(fields.soc);

  if (fields.km.trim() === "" || !Number.isFinite(km)) errors.km = "Enter where the car is.";
  else if (km < 0 || km >= endKm) errors.km = `Between 0 and ${whole.format(endKm)} km.`;

  let time: Date | undefined;
  if (!fields.clock) errors.clock = "Enter the time.";
  else {
    time = raceTimeToUtc(plan, Number(fields.day), fields.clock);
    if (time.getTime() < Date.parse(plan.time_utc[0])) errors.clock = "That's before the start.";
  }

  if (fields.soc.trim() === "" || !Number.isFinite(soc)) errors.soc = "Enter the battery level.";
  else if (soc < 0 || soc > 100) errors.soc = "Between 0 and 100%.";

  if (Object.keys(errors).length > 0 || !time) return { errors };
  return { errors, request: { km, time_utc: time.toISOString(), soc: soc / 100 } };
}
