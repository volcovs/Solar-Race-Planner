import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routes } from "../app/routes";
import { ROUTE_FILE } from "../test/fixtures";
import { Chart as FakeChart } from "../test/echartsMock";
import { Map as FakeMap } from "../test/maplibreMock";

function respondWith(routeFile: unknown, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.endsWith("route.geojson")
        ? { ok, status: ok ? 200 : 404, json: async () => routeFile }
        : { ok: true, json: async () => ({ status: "ok", version: "0.1.0" }) },
    ),
  );
}

async function openMap() {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ["/map"] })} />);
  await screen.findByText(/Start → End/); // route loaded and the map created
  const map = FakeMap.instances.at(-1)!;
  act(() => map.emit("style.load"));
  return { map };
}

/** The page with its timeline drawn from the mocked plan. */
async function openTimeline() {
  const { map } = await openMap();
  await screen.findByRole("img", { name: /along the route/ });
  return { map, chart: FakeChart.instances.at(-1)! };
}

const cursorCard = () => screen.queryByRole("region", { name: "At the cursor" });

beforeEach(() => {
  FakeMap.instances.length = 0;
  FakeChart.instances.length = 0;
  document.documentElement.dataset.theme = "light";
  respondWith(ROUTE_FILE);
});
afterEach(() => vi.unstubAllGlobals());

describe("MapPage", () => {
  it("draws the route with its stops on a light base map", async () => {
    const { map } = await openMap();

    expect(screen.getByRole("heading", { level: 1, name: "Route map" })).toBeInTheDocument();
    expect(screen.getByText(/· 1 control stop$/)).toBeInTheDocument();
    expect(map.options.style).toContain("positron");
    expect([...map.layers]).toEqual(["route-casing", "route-line", "stops-circle", "stops-label", "cursor"]);
  });


  it("has a button that shows the whole route", async () => {
    const { map } = await openMap();
    const button = map.controls[0].onAdd(map).querySelector("button")!; // the fake zoom control isn't recorded

    expect(button).toHaveAccessibleName("Show the whole route");
    fireEvent.click(button);
    expect(map.fitBounds).toHaveBeenCalledWith(
      [
        [0, 0],
        [3, 0],
      ],
      expect.anything(),
    );
  });

  it("shows details of a clicked stretch and closes them", async () => {
    const { map } = await openMap();
    map.queryRenderedFeatures.mockReturnValue([{ id: 0 }]);

    act(() => map.emit("click", { point: { x: 10, y: 10 }, lngLat: { lng: 0.02, lat: 0 } }));

    expect(screen.getByRole("heading", { name: "km 0–5" })).toBeInTheDocument();
    expect(map.setFeatureState).toHaveBeenCalledWith({ source: "segments", id: 0 }, { selected: true });
    expect(screen.getByText("Middle")).toBeInTheDocument(); // next control stop

    fireEvent.click(screen.getByRole("button", { name: "Close details" }));
    expect(screen.queryByRole("region", { name: "Selected stretch" })).not.toBeInTheDocument();
  });

  it("switches to the dark base map with the theme", async () => {
    const { map } = await openMap();

    act(() => {
      document.documentElement.dataset.theme = "dark";
    });

    await waitFor(() => expect(map.setStyle).toHaveBeenCalledWith(expect.stringContaining("/dark"), { diff: false }));
  });

  it("says so when the route can't be loaded", async () => {
    respondWith({}, false);
    render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ["/map"] })} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load the route (Route data: 404)");
  });

  describe("timeline", () => {
    it("draws battery, speed, sun and wind under the map", async () => {
      const { chart } = await openTimeline();

      expect(screen.getByRole("heading", { name: "Race timeline" })).toBeInTheDocument();
      // SoC band (floor + width), planned SoC, speed, irradiance, headwind, tailwind.
      expect(chart.option.series).toHaveLength(7);
      expect(cursorCard()).not.toBeInTheDocument();
    });

    it("follows the cursor on the map", async () => {
      const { map, chart } = await openTimeline();
      map.queryRenderedFeatures.mockReturnValue([{ id: 2 }]); // the stretch km 10–15

      act(() => map.emit("mousemove", { point: { x: 1, y: 1 }, lngLat: { lng: 0.11, lat: 0 } }));

      expect(cursorCard()).toHaveTextContent(/km 1[0-5]/);
      expect(chart.dispatchAction).toHaveBeenLastCalledWith(
        expect.objectContaining({ type: "updateAxisPointer", currTrigger: "mousemove" }),
        { silent: true },
      );

      act(() => map.emit("mouseout"));
      expect(cursorCard()).not.toBeInTheDocument();
      expect(chart.dispatchAction).toHaveBeenLastCalledWith({ type: "updateAxisPointer", currTrigger: "leave" }, { silent: true });
    });

    it("moves the dot on the map with the chart's cursor, and picks that stretch on click", async () => {
      const { map, chart } = await openTimeline();

      act(() => chart.emit("updateAxisPointer", { axesInfo: [{ axisDim: "x", value: 100 }] }));

      expect(cursorCard()).toHaveTextContent("km 100");
      expect(cursorCard()).toHaveTextContent("Middle in 50 km");
      const dot = map.sources.get("cursor")!.setData.mock.lastCall![0];
      expect(dot.features[0].geometry.type).toBe("Point");

      act(() => chart.zrHandlers.click.forEach((handler) => handler()));
      expect(screen.getByRole("heading", { name: "km 100–105" })).toBeInTheDocument();
    });

    it("shows the values where the route is tapped, and clears them on a tap beside it", async () => {
      const { map } = await openTimeline();

      map.queryRenderedFeatures.mockReturnValue([{ id: 2 }]);
      act(() => map.emit("click", { point: { x: 1, y: 1 }, lngLat: { lng: 0.11, lat: 0 } }));
      expect(cursorCard()).toHaveTextContent(/km 1[0-5]/);

      map.queryRenderedFeatures.mockReturnValue([]);
      act(() => map.emit("click", { point: { x: 1, y: 1 }, lngLat: { lng: 2, lat: 2 } }));
      expect(cursorCard()).not.toBeInTheDocument();
    });

    it("can be driven from the keyboard", async () => {
      const { chart } = await openTimeline();
      const timeline = screen.getByRole("img", { name: /along the route/ });

      fireEvent.keyDown(timeline, { key: "ArrowRight" });
      fireEvent.keyDown(timeline, { key: "ArrowRight" });
      expect(cursorCard()).toHaveTextContent("km 20");
      expect(chart.dispatchAction).toHaveBeenLastCalledWith(expect.objectContaining({ currTrigger: "mousemove" }), { silent: true });

      // Held keys repeat faster than the page re-renders; each press still builds on the last.
      act(() => {
        timeline.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
        timeline.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
      });
      expect(cursorCard()).toHaveTextContent("km 324");

      fireEvent.keyDown(timeline, { key: "Escape" });
      expect(cursorCard()).not.toBeInTheDocument();
    });

    it("can be hidden to give the map the room", async () => {
      await openTimeline();

      fireEvent.click(screen.getByRole("button", { name: "Hide the timeline" }));

      expect(screen.getByRole("button", { name: "Show the timeline" })).toHaveAttribute("aria-expanded", "false");
      expect(screen.getByRole("img", { name: /along the route/, hidden: true })).not.toBeVisible();
    });
  });
});
