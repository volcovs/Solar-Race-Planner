import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { THEME_STORAGE_KEY } from "../lib/theme";
import { ThemeToggle } from "./ThemeToggle";

beforeEach(() => {
  document.documentElement.dataset.theme = "light";
  localStorage.clear();
});

describe("ThemeToggle", () => {
  it("switches the theme and remembers the choice", async () => {
    render(<ThemeToggle />);

    fireEvent.click(screen.getByRole("button", { name: "Switch to dark theme" }));

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(await screen.findByRole("button", { name: "Switch to light theme" })).toBeInTheDocument();
  });

  it("starts from the theme already on the page", () => {
    document.documentElement.dataset.theme = "dark";
    render(<ThemeToggle />);

    expect(screen.getByRole("button", { name: "Switch to light theme" })).toBeInTheDocument();
  });
});
