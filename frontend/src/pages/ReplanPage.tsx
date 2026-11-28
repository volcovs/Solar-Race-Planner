import { LocateFixed } from "lucide-react";
import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { PageContainer } from "../components/PageContainer";
import { PageHeader } from "../components/PageHeader";
import { PlanDiff } from "../components/replan/PlanDiff";
import { getPlan, replan } from "../lib/api";
import { nearestKm } from "../lib/geo";
import { raceTimeToUtc, zoneLabel, type PlanResponse, type ReplanRequest } from "../lib/plan";
import { loadRoute, type RouteData } from "../lib/route";
import { useOnline } from "../lib/useOnline";

// Until the API serves the route (BE-04): the file exported by the route pipeline (DAT-01).
const ROUTE_URL = `${import.meta.env.BASE_URL}sample/route.geojson`;
const FAR_FROM_ROUTE_KM = 5;

interface Fields {
  km: string;
  day: string;
  clock: string; // "HH:MM", local race time
  soc: string; // percent
}

type Errors = Partial<Record<keyof Fields, string>>;

type Locate = { status: "idle" | "locating" } | { status: "found"; offKm: number } | { status: "failed"; message: string };

type Run = { status: "idle" } | { status: "running" } | { status: "error"; message: string } | { status: "done"; plan: PlanResponse };

const whole = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });

/** Where the car is now (km, clock, battery) → a new plan to the finish, compared with the previous one. */
export function ReplanPage() {
  const online = useOnline();
  const [plan, setPlan] = useState<PlanResponse>();
  const [loadError, setLoadError] = useState<string>();
  const [fields, setFields] = useState<Fields>({ km: "", day: "1", clock: "", soc: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [run, setRun] = useState<Run>({ status: "idle" });
  const [route, setRoute] = useState<RouteData>();
  const [locate, setLocate] = useState<Locate>({ status: "idle" });

  useEffect(() => {
    const abort = new AbortController();
    getPlan(abort.signal)
      .then(setPlan)
      .catch((error: Error) => abort.signal.aborted || setLoadError(error.message));
    loadRoute(ROUTE_URL, abort.signal).then(setRoute, () => {}); // only for "Use my location"
    return () => abort.abort();
  }, []);

  // Location needs HTTPS (or localhost), and only runs after the browser's permission prompt.
  const canLocate = window.isSecureContext && "geolocation" in navigator;

  const locateCar = () => {
    if (!route) return;
    setLocate({ status: "locating" });
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const here = nearestKm(route.line, route.cumKm, [coords.longitude, coords.latitude]);
        setFields((f) => ({ ...f, km: here.km.toFixed(1) }));
        setLocate({ status: "found", offKm: here.offKm });
      },
      (error) => setLocate({ status: "failed", message: LOCATION_ERRORS[error.code] ?? error.message }),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
    );
  };

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
            <Field label="Position, km" error={errors.km} note={locateNote(locate, canLocate)}>
              {(props) => (
                <div className="flex gap-2">
                  <input
                    {...props}
                    type="number"
                    inputMode="decimal"
                    value={fields.km}
                    onChange={(e) => {
                      set("km")(e.target.value);
                      setLocate({ status: "idle" });
                    }}
                  />
                  <button
                    type="button"
                    onClick={locateCar}
                    disabled={!canLocate || !route || locate.status === "locating"}
                    aria-label="Use my location"
                    title={canLocate ? "Use my location" : "Location needs the app over HTTPS"}
                    className="inline-flex size-12 shrink-0 items-center justify-center rounded-control border border-line text-ink disabled:opacity-50"
                  >
                    <LocateFixed className={`size-5 ${locate.status === "locating" ? "animate-pulse" : ""}`} aria-hidden />
                  </button>
                </div>
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
            disabled={run.status === "running" || !online}
            className="mt-5 inline-flex h-12 items-center rounded-control bg-brand px-6 font-medium text-on-brand disabled:opacity-60"
          >
            {run.status === "running" ? "Re-planning…" : "Re-plan"}
          </button>
          {!online && <p className="mt-3 text-sm text-ink-muted">Needs signal: plans are made on the server.</p>}
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

/** A labelled input with its error (or a note) under it; the render prop gets the id and aria wiring. */
function Field({
  label,
  error,
  note,
  children,
}: {
  label: string;
  error?: string;
  note?: { text: string; risk: boolean };
  children: (props: { id: string; className: string; "aria-invalid": boolean; "aria-describedby"?: string }) => ReactNode;
}) {
  const id = useId();
  const message = error ? { text: error, risk: true } : note;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm text-ink-muted">
        {label}
      </label>
      {children({ id, className: INPUT, "aria-invalid": !!error, "aria-describedby": message ? `${id}-message` : undefined })}
      {message && (
        <p id={`${id}-message`} role="status" className={`mt-1 text-sm ${message.risk ? "text-risk" : "text-ink-muted"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}

/** What "Use my location" found, or why it couldn't. */
function locateNote(locate: Locate, canLocate: boolean): { text: string; risk: boolean } | undefined {
  if (!canLocate) return { text: "Location needs the app over HTTPS.", risk: false };
  if (locate.status === "failed") return { text: locate.message, risk: true };
  if (locate.status !== "found") return undefined;
  return locate.offKm > FAR_FROM_ROUTE_KM
    ? { text: `You're ${oneDecimal.format(locate.offKm)} km from the route; check the km.`, risk: true }
    : { text: `From your location, ${oneDecimal.format(locate.offKm)} km off the route.`, risk: false };
}

// GeolocationPositionError codes.
const LOCATION_ERRORS: Record<number, string> = {
  1: "Location access is off for this site; allow it in the browser's settings.",
  2: "The phone couldn't find its position; try again in the open.",
  3: "Finding the position took too long; try again.",
};

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
