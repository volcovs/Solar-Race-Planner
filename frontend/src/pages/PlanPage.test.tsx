import { render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routes } from "../app/routes";
import { ROUTE_FILE } from "../test/fixtures";

// The plan comes from the mocked API, which drives the fixture route.
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
afterEach(() => vi.unstubAllGlobals());

describe("PlanPage", () => {
  it("shows the plan day by day and stop by stop, in local race time", async () => {
    render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ["/plan"] })} />);

    const days = await screen.findByRole("region", { name: "Day by day" });
    expect(screen.getByText("Local time: Australia/Darwin (UTC+9:30)")).toBeInTheDocument();
    expect(within(days).getByRole("heading", { name: "Day 1" })).toBeInTheDocument();
    expect(within(days).getByText("Finish")).toBeInTheDocument();

    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows.map((row) => within(row).queryByRole("rowheader")?.textContent ?? "header")).toEqual([
      "header",
      expect.stringMatching(/^Start → Middle/),
      expect.stringMatching(/^Middle → End/),
    ]);
  });
});
