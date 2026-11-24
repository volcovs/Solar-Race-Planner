import { useEffect, useState } from "react";
import { PageContainer } from "../components/PageContainer";
import { PageHeader } from "../components/PageHeader";
import { DayCards } from "../components/plan/DayCards";
import { StageTable } from "../components/plan/StageTable";
import { getPlan } from "../lib/api";
import { zoneLabel, type PlanResponse } from "../lib/plan";
import { useWakeLock } from "../lib/useWakeLock";

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; plan: PlanResponse };

/** The plan in big numbers for the chase car: day by day, then stop by stop. */
export function PlanPage() {
  useWakeLock(); // read in the chase car: keep the screen on
  const [load, setLoad] = useState<Load>({ status: "loading" });

  useEffect(() => {
    const abort = new AbortController();
    getPlan(abort.signal)
      .then((plan) => setLoad({ status: "ready", plan }))
      .catch((error: Error) => abort.signal.aborted || setLoad({ status: "error", message: error.message }));
    return () => abort.abort();
  }, []);

  const plan = load.status === "ready" ? load.plan : undefined;

  return (
    <PageContainer>
      <PageHeader title="Race plan">
        {plan && <>Local time: {zoneLabel(plan)}</>}
      </PageHeader>

      {load.status === "loading" && <p className="text-ink-muted">Loading the plan…</p>}
      {load.status === "error" && (
        <p role="alert" className="text-risk">
          Couldn't load the plan ({load.message}).
        </p>
      )}
      {plan && (
        <div className="space-y-10">
          <section aria-labelledby="days">
            <h2 id="days" className="mb-4 font-display text-2xl font-semibold">
              Day by day
            </h2>
            <DayCards plan={plan} />
          </section>
          <section aria-labelledby="stages">
            <h2 id="stages" className="mb-4 font-display text-2xl font-semibold">
              Stop by stop
            </h2>
            <StageTable plan={plan} />
          </section>
        </div>
      )}
    </PageContainer>
  );
}
