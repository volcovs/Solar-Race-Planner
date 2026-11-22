import { render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SECTIONS } from "./navigation";
import { routes } from "./routes";

function renderAt(path: string) {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
}

beforeEach(() => {
  // The status pill calls the API; these tests are about navigation.
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ status: "ok", version: "0.1.0" }) })));
});
afterEach(() => vi.unstubAllGlobals());

describe("routes", () => {
  it.each(SECTIONS)("$path shows its page and marks its tab as current", async (section) => {
    renderAt(section.path);

    // findBy: some pages (the map) load on demand.
    expect(await screen.findByRole("heading", { level: 1, name: section.title })).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: section.label })).toHaveAttribute("aria-current", "page");
  });

  it("sets the browser tab title", () => {
    renderAt("/plan");

    expect(document.title).toBe("Race plan · Solar Race Planner");
  });

  it("shows a not-found page for unknown paths", () => {
    renderAt("/no-such-page");

    expect(screen.getByRole("heading", { level: 1, name: "Page not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to the overview" })).toHaveAttribute("href", "/");
  });
});
