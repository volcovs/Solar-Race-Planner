import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StatusPill } from "./StatusPill";

// fetch is mocked, so no backend needs to run.
function mockFetch(ok: boolean, body: unknown = {}) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok, status: ok ? 200 : 500, json: async () => body })));
}

afterEach(() => vi.unstubAllGlobals());

describe("StatusPill", () => {
  it("shows the API version when it answers", async () => {
    mockFetch(true, { status: "ok", version: "0.1.0" });
    render(<StatusPill />);

    expect(screen.getByRole("status")).toHaveTextContent("Checking API…");
    expect(await screen.findByText("API online · v0.1.0")).toBeInTheDocument();
  });

  it("says so when the API is down", async () => {
    mockFetch(false);
    render(<StatusPill />);

    expect(await screen.findByText("API offline")).toBeInTheDocument();
  });
});
