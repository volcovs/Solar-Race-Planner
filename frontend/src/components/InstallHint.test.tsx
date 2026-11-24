import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InstallHint } from "./InstallHint";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36";

function phone(userAgent: string, { installed = false } = {}) {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(userAgent);
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: installed && query.includes("standalone") }));
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("InstallHint", () => {
  it("tells iPhone users how to add the app to the home screen, until they hide it", () => {
    phone(IPHONE);
    const { unmount } = render(<InstallHint />);

    expect(screen.getByRole("complementary", { name: "Install" })).toHaveTextContent("Add to Home Screen");
    fireEvent.click(screen.getByRole("button", { name: "Hide this tip" }));
    expect(screen.queryByRole("complementary", { name: "Install" })).not.toBeInTheDocument();

    unmount();
    render(<InstallHint />);
    expect(screen.queryByRole("complementary", { name: "Install" })).not.toBeInTheDocument(); // remembered
  });

  it("stays away once installed, and on Android, which has its own install prompt", () => {
    phone(IPHONE, { installed: true });
    const { unmount } = render(<InstallHint />);
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    unmount();

    phone(ANDROID);
    render(<InstallHint />);
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });
});
