import { render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** The app at `path`, with the build settings in `env` (read when lib/site loads). */
async function openAt(path: string, env: Record<string, string> = {}) {
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  vi.resetModules();
  const { routes } = await import("../app/routes");
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ status: "ok", version: "0.1.0" }) })));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("About, Contact and the footer", () => {
  it("tells what the project is and how to install it on a phone", async () => {
    await openAt("/about");

    expect(screen.getByRole("heading", { level: 1, name: "About the project" })).toBeInTheDocument();
    expect(screen.getByText("race strategy app for solar cars")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "On a phone" })).toBeInTheDocument();
  });

  it("sends questions to the project's GitHub issues", async () => {
    await openAt("/contact", { VITE_REPO_URL: "https://github.com/example/planner" });

    const page = screen.getByRole("main");
    expect(within(page).getByRole("link", { name: "New issue" })).toHaveAttribute(
      "href",
      "https://github.com/example/planner/issues/new",
    );
    expect(within(page).getByRole("link", { name: "Source code" })).toHaveAttribute("href", "https://github.com/example/planner");
  });

  it("ends each page with the footer: copyright, month of the last update and site links", async () => {
    await openAt("/plan");

    const footer = await screen.findByRole("contentinfo");
    const updated = new Date(__LAST_UPDATE__);
    const month = updated.toLocaleString("en-GB", { month: "long", year: "numeric" });
    expect(footer).toHaveTextContent(`© ${updated.getFullYear()} Solar Race Planner · ${month}`);
    expect(within(footer).getByText(month)).toHaveAttribute("dateTime", updated.toISOString());
    const links = within(within(footer).getByRole("navigation", { name: "Site" })).getAllByRole("link");
    expect(links.map((a) => a.textContent)).toEqual(["About", "Contact"]);
  });

  it("leaves the footer off the full-screen map", async () => {
    await openAt("/map");

    await screen.findByRole("heading", { level: 1, name: "Route map" });
    expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
  });
});
