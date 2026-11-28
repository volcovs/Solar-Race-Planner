import { LoaderCircle, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PageContainer } from "../components/PageContainer";
import { PageHeader } from "../components/PageHeader";
import { ScenarioControls } from "../components/whatif/ScenarioControls";
import { ScenarioResult } from "../components/whatif/ScenarioResult";
import { runScenarios } from "../lib/api";
import { zoneLabel, type PlanResponse, type Scenario } from "../lib/plan";

const AS_PLANNED: Scenario = { start_soc: 1, weather_shift_h: 0, weather: "p50", cda_factor: 1, strategy: "planned" };
const NAMES = ["A", "B", "C"];
// Tailwind needs whole class names in the source.
const COLUMNS = ["", "md:grid-cols-1", "md:grid-cols-2", "md:grid-cols-3"];

type Run =
  | { status: "idle" }
  | { status: "running" }
  | { status: "error"; message: string }
  | { status: "done"; plans: PlanResponse[]; ranFor: string };

/** Up to three what-if scenarios side by side; B and C are compared with A. */
export function WhatIfPage() {
  // Start with the question people ask first: is varying the speed worth it over cruising?
  const [scenarios, setScenarios] = useState<Scenario[]>([AS_PLANNED, { ...AS_PLANNED, strategy: "constant" }]);
  const [run, setRun] = useState<Run>({ status: "idle" });
  const abort = useRef<AbortController>();
  useEffect(() => () => abort.current?.abort(), []);

  const start = async () => {
    abort.current = new AbortController();
    setRun({ status: "running" });
    try {
      const plans = await runScenarios(scenarios, abort.current.signal);
      setRun({ status: "done", plans, ranFor: JSON.stringify(scenarios) });
    } catch (error) {
      const cancelled = (error as Error).name === "AbortError";
      setRun(cancelled ? { status: "idle" } : { status: "error", message: (error as Error).message });
    }
  };

  // Adding or removing a scenario reorders the columns, so earlier results no longer line up.
  const edit = (next: Scenario[], keepResults: boolean) => {
    setScenarios(next);
    if (!keepResults && run.status === "done") setRun({ status: "idle" });
  };

  const done = run.status === "done" ? run : undefined;
  const stale = done && done.ranFor !== JSON.stringify(scenarios);

  return (
    <PageContainer>
      <PageHeader title="What-if scenarios">
        {done ? <>Local time: {zoneLabel(done.plans[0])}</> : "Change the start battery, weather, drag or speed, and compare."}
      </PageHeader>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        {run.status === "running" ? (
          <>
            <span role="status" className="inline-flex items-center gap-2 text-ink-muted">
              <LoaderCircle className="size-5 animate-spin" aria-hidden />
              Running {scenarios.length} scenarios…
            </span>
            <button
              type="button"
              onClick={() => abort.current?.abort()}
              className="h-12 rounded-control border border-line px-5 font-medium hover:bg-surface-muted"
            >
              Cancel
            </button>
          </>
        ) : (
          <button type="button" onClick={start} className="h-12 rounded-control bg-sun px-6 font-medium text-on-sun">
            Run scenarios
          </button>
        )}
        {scenarios.length < NAMES.length && (
          <button
            type="button"
            onClick={() => edit([...scenarios, { ...scenarios[scenarios.length - 1] }], false)}
            disabled={run.status === "running"}
            className="inline-flex h-12 items-center gap-2 rounded-control px-4 font-medium text-ink-muted hover:bg-surface-muted hover:text-ink disabled:opacity-50"
          >
            <Plus className="size-4" aria-hidden />
            Add scenario
          </button>
        )}
        {stale && <span className="text-sm text-ink-muted">Settings changed since the last run.</span>}
        {run.status === "error" && (
          <p role="alert" className="text-risk">
            Couldn't run the scenarios ({run.message}).
          </p>
        )}
      </div>

      <div className={`grid gap-4 ${COLUMNS[scenarios.length]}`}>
        {scenarios.map((scenario, i) => (
          <section key={i} aria-label={`Scenario ${NAMES[i]}`}>
            <ScenarioControls
              name={`Scenario ${NAMES[i]}`}
              scenario={scenario}
              onChange={(next) => edit(scenarios.map((s, j) => (j === i ? next : s)), true)}
              onRemove={i > 0 ? () => edit(scenarios.filter((_, j) => j !== i), false) : undefined}
            />
            {done && (
              <div className={stale ? "opacity-50" : ""}>
                <ScenarioResult plan={done.plans[i]} baseline={i > 0 ? done.plans[0] : undefined} />
              </div>
            )}
          </section>
        ))}
      </div>
    </PageContainer>
  );
}
