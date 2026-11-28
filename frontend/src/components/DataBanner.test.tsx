import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getForecast } from "../lib/api";
import type { ForecastResponse } from "../lib/plan";
import { age, DataBanner } from "./DataBanner";

vi.mock("../lib/api", () => ({ getForecast: vi.fn() }));

const issuedHoursAgo = (hours: number) =>
  vi.mocked(getForecast).mockResolvedValue({ issue_time_utc: new Date(Date.now() - hours * 3_600_000).toISOString() } as ForecastResponse);
const setOnline = (online: boolean) => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(online);
  window.dispatchEvent(new Event(online ? "online" : "offline"));
};
const banner = () => screen.queryByRole("complementary", { name: "Data status" });
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 20)));

afterEach(() => vi.restoreAllMocks());

describe("age", () => {
  const now = new Date("2026-11-28T12:00:00Z");
  it("says how long ago, in the largest unit there are at least two of", () => {
    expect(age(new Date("2026-11-28T11:55:00Z"), now)).toBe("5 minutes ago");
    expect(age(new Date("2026-11-28T09:00:00Z"), now)).toBe("3 hours ago");
    expect(age(new Date("2026-11-27T08:00:00Z"), now)).toBe("28 hours ago");
    expect(age(new Date("2025-08-23T12:00:00Z"), now)).toBe("15 months ago");
  });
});

describe("DataBanner", () => {
  it("stays out of the way with signal and a fresh forecast", async () => {
    setOnline(true);
    issuedHoursAgo(2);
    render(<DataBanner />);
    await settle();

    expect(banner()).not.toBeInTheDocument();
  });

  it("warns when the forecast is old, even with signal", async () => {
    setOnline(true);
    issuedHoursAgo(9);
    render(<DataBanner />);

    expect(await screen.findByRole("complementary", { name: "Data status" })).toHaveTextContent(
      "Forecast issued 9 hours ago. It may be out of date.",
    );
  });

  it("says when it's offline, with the saved forecast's age", async () => {
    setOnline(true);
    issuedHoursAgo(2);
    render(<DataBanner />);
    await settle();

    act(() => setOnline(false));
    expect(await screen.findByText("Offline.")).toBeInTheDocument();
    expect(banner()).toHaveTextContent("Offline. Showing what this device saved. Forecast issued 2 hours ago.");
  });

  it("says when there's no forecast saved", async () => {
    setOnline(false);
    vi.mocked(getForecast).mockRejectedValue(new Error("offline"));
    render(<DataBanner />);

    expect(await screen.findByText(/No forecast saved on this device yet\./)).toBeInTheDocument();
  });
});
