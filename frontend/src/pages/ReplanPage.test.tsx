import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
afterEach(() => {
  vi.unstubAllGlobals();
  delete (navigator as { geolocation?: unknown }).geolocation;
});

/** The phone's GPS reports `lonLat` (or fails with `errorCode`). jsdom has none, so add it. */
function stubGps(result: { lonLat: [number, number] } | { errorCode: number }) {
  vi.stubGlobal("isSecureContext", true);
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: (ok: PositionCallback, fail: PositionErrorCallback) =>
        "lonLat" in result
          ? ok({ coords: { longitude: result.lonLat[0], latitude: result.lonLat[1] } } as GeolocationPosition)
          : fail({ code: result.errorCode, message: "" } as GeolocationPositionError),
    },
  });
}

async function useMyLocation() {
  const button = screen.getByRole("button", { name: "Use my location" });
  await waitFor(() => expect(button).toBeEnabled()); // once the route has loaded
  fireEvent.click(button);
}

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

  describe("Use my location", () => {
    it("fills the km from the phone's position, snapped to the route", async () => {
      stubGps({ lonLat: [1, 0.001] }); // beside the fixture route, one degree (~111 km) from the start
      await openReplan();
      await useMyLocation();

      expect(screen.getByLabelText("Position, km")).toHaveValue(111.2);
      expect(screen.getByText("From your location, 0.1 km off the route.")).toBeInTheDocument();
    });

    it("warns when the phone is far from the route", async () => {
      stubGps({ lonLat: [1, 0.5] }); // ~56 km north of it
      await openReplan();
      await useMyLocation();

      expect(screen.getByText(/You're 55\.\d km from the route/)).toBeInTheDocument();
    });

    it("says so when location is refused", async () => {
      stubGps({ errorCode: 1 });
      await openReplan();
      await useMyLocation();

      expect(screen.getByText(/Location access is off for this site/)).toBeInTheDocument();
    });
  });
});
