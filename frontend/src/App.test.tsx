import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

// fetch is mocked, so no backend needs to run.
function mockFetch(ok: boolean, body: unknown = {}) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok, status: ok ? 200 : 500, json: async () => body })));
}

afterEach(() => vi.unstubAllGlobals());

describe("App", () => {
  it("shows the API health", async () => {
    mockFetch(true, { status: "ok", version: "0.1.0" });
    render(<App />);
    expect(await screen.findByText("API ok · v0.1.0")).toBeInTheDocument();
  });

  it("says so when the API is down", async () => {
    mockFetch(false);
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent("API unavailable");
  });
});
