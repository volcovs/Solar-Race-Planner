import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routes } from "../app/routes";
import { ROUTE_FILE } from "../test/fixtures";

// /scenarios comes from the mocked API, which drives the fixture route after a short pause.
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

function openWhatIf() {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ["/what-if"] })} />);
}
const scenario = (name: string) => screen.getByRole("region", { name: `Scenario ${name}` });
const button = (name: string) => screen.getByRole("button", { name });

describe("WhatIfPage", () => {
  it("starts with planned against constant speed, and compares them when run", async () => {
    openWhatIf();
    expect(within(scenario("A")).getByRole("radio", { name: "Planned" })).toBeChecked();
    expect(within(scenario("B")).getByRole("radio", { name: "Constant" })).toBeChecked();

    fireEvent.click(button("Run scenarios"));
    expect(screen.getByText("Running 2 scenarios…")).toBeInTheDocument();

    await within(scenario("B")).findByText("Finish", {}, { timeout: 5000 });
    expect(within(scenario("A")).getByText("The others are compared with this one.")).toBeInTheDocument();
    expect(within(scenario("B")).getAllByText(/no change|pts|min|km\/h/).length).toBeGreaterThan(0);
  });

  it("needs signal to run", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    openWhatIf();

    expect(button("Run scenarios")).toBeDisabled();
    expect(screen.getByText("Needs signal: plans are made on the server.")).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it("can be cancelled while it runs", async () => {
    openWhatIf();
    fireEvent.click(button("Run scenarios"));
    fireEvent.click(button("Cancel"));

    await waitFor(() => expect(button("Run scenarios")).toBeInTheDocument());
    expect(within(scenario("A")).queryByText("Finish")).not.toBeInTheDocument();
  });

  it("takes up to three scenarios, and marks results out of date when a setting changes", async () => {
    openWhatIf();
    fireEvent.click(button("Add scenario"));
    expect(scenario("C")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add scenario" })).not.toBeInTheDocument();

    fireEvent.click(button("Run scenarios"));
    await within(scenario("C")).findByText("Finish", {}, { timeout: 5000 });

    fireEvent.click(within(scenario("C")).getByRole("radio", { name: "P10" }));
    expect(screen.getByText("Settings changed since the last run.")).toBeInTheDocument();
  });
});
