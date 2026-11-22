import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routes } from "../app/routes";
import { ROUTE_FILE } from "../test/fixtures";
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

beforeEach(() => {
  FakeMap.instances.length = 0;
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
    expect([...map.layers]).toEqual(["route-casing", "route-line", "stops-circle", "stops-label"]);
  });


  it("shows details of a clicked stretch and closes them", async () => {
    const { map } = await openMap();
    map.queryRenderedFeatures.mockReturnValue([{ id: 0 }]);

    act(() => map.emit("click", { point: { x: 10, y: 10 } }));

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
});
