import { render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routes } from "../app/routes";
import { ROUTE_FILE } from "../test/fixtures";

// The mocked race starts at 08:30 Darwin time (UTC+9:30) on Sun 24 Aug 2025.
function openAt(iso: string) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(iso));
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ["/"] })} />);
  return screen.findByRole("region", { name: "Planned position now" });
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.endsWith("route.geojson")
        ? { ok: true, json: async () => ROUTE_FILE }
        : { ok: true, json: async () => ({ status: "ok", version: "0.1.0" }) },
    ),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("OverviewPage", () => {
  it("sums up the plan", async () => {
    await openAt("2025-08-01T00:00:00Z");

    expect(screen.getByRole("heading", { level: 1, name: "Race overview" })).toBeInTheDocument();
    for (const label of ["Finish", "Distance", "Battery at the finish", "Lowest (P10)"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByRole("img", { name: "Route outline" })).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Details" })).getByRole("link", { name: "Full plan" })).toHaveAttribute(
      "href",
      "/plan",
    );
  });

  it("before the race, says when it starts", async () => {
    const now = await openAt("2025-08-01T00:00:00Z");
    expect(now).toHaveTextContent("Sun 24 Aug");
    expect(now).toHaveTextContent("Start at 08:30");
  });

  it("during the race, says where the car should be and what's next", async () => {
    const now = await openAt("2025-08-24T01:30:00Z"); // 11:00 on day 1
    expect(now).toHaveTextContent(/km \d+Day 1 · \d+% battery/);
    expect(now).toHaveTextContent(/Next: .+ in \d+ km, at \d\d:\d\d/);
  });

  it("after the race, says it has finished", async () => {
    const now = await openAt("2026-01-01T00:00:00Z");
    expect(now).toHaveTextContent("Finished");
  });
});
