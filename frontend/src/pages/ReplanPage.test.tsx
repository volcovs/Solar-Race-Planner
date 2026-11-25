import { fireEvent, render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routes } from "../app/routes";
import { ROUTE_FILE } from "../test/fixtures";

// /plan and /replan come from the mocked API, which drives the fixture route (~334 km).
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

async function openReplan() {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ["/replan"] })} />);
  await screen.findByRole("button", { name: "Re-plan" });
}

const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("ReplanPage", () => {
  it("checks the inputs before calling the API", async () => {
    await openReplan();

    fireEvent.click(screen.getByRole("button", { name: "Re-plan" }));
    expect(screen.getByText("Enter where the car is.")).toBeInTheDocument();
    expect(screen.getByText("Enter the time.")).toBeInTheDocument();
    expect(screen.getByText("Enter the battery level.")).toBeInTheDocument();

    fill("Position, km", "500");
    fill("Time", "06:00"); // day 1, before the 08:30 start
    fill("Battery, %", "101");
    fireEvent.click(screen.getByRole("button", { name: "Re-plan" }));
    expect(screen.getByText("Between 0 and 334 km.")).toBeInTheDocument();
    expect(screen.getByText("That's before the start.")).toBeInTheDocument();
    expect(screen.getByText("Between 0 and 100%.")).toBeInTheDocument();
    expect(screen.getByLabelText("Battery, %")).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("region", { name: "New plan vs previous" })).not.toBeInTheDocument();
  });

  it("shows the new plan against the previous one", async () => {
    await openReplan();

    fill("Position, km", "100");
    fill("Time", "13:00");
    fill("Battery, %", "40");
    fireEvent.click(screen.getByRole("button", { name: "Re-plan" }));

    const diff = await screen.findByRole("region", { name: "New plan vs previous" });
    expect(within(diff).getByText("Arrive End")).toBeInTheDocument();
    const rows = within(within(diff).getByRole("table")).getAllByRole("rowheader");
    expect(rows.map((r) => r.textContent)).toEqual(["Middlekm 150", "Endkm 334"]);
  });
});
