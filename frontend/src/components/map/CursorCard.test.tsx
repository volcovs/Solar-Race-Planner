import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ForecastResponse, PlanResponse } from "../../lib/plan";
import { CursorCard } from "./CursorCard";

const plan: PlanResponse = {
  plan_id: "test",
  created_at: "2025-08-23T12:00:00Z",
  timezone: "UTC",
  min_soc: 0.1,
  days: [{ day: 1, start_km: 0, end_km: 100 }],
  km: [0, 100],
  time_utc: ["2025-08-24T08:00:00Z", "2025-08-24T09:00:00Z"],
  speed_kmh: [80, 80],
  soc: [0.5, 0.2],
  soc_p10: [0.4, 0.06],
  soc_p90: [0.6, 0.3],
};
const forecast: ForecastResponse = { model: "test", issue_time_utc: "", km: [0, 100], ghi_w_m2: [800, 800], headwind_ms: [0, 0] };

const show = (km: number) => render(<CursorCard km={km} plan={plan} forecast={forecast} stops={[]} />);

describe("CursorCard", () => {
  it("shows the planned battery alone while the pessimistic case stays above the minimum", () => {
    show(0);

    expect(screen.getByRole("region", { name: "At the cursor" })).toHaveTextContent("Battery50%Speed");
    expect(screen.queryByText(/Low battery risk/)).not.toBeInTheDocument();
  });

  it("warns where the pessimistic case falls below the minimum", () => {
    show(100);

    expect(screen.getByText(/Low battery risk/)).toHaveTextContent("could reach 6%, under the 10% minimum");
  });
});
