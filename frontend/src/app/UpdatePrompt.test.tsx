import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { pwa } from "../test/pwaMock";
import { UpdatePrompt } from "./UpdatePrompt";

afterEach(() => {
  pwa.needRefresh = false;
  pwa.offlineReady = false;
  pwa.updateServiceWorker.mockClear();
});

describe("UpdatePrompt", () => {
  it("offers a new version, and only reloads when asked", () => {
    pwa.needRefresh = true;
    render(<UpdatePrompt />);

    expect(screen.getByRole("status")).toHaveTextContent("A new version of the app is available.");
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(pwa.updateServiceWorker).toHaveBeenCalledWith(true);
  });

  it("can be put off", () => {
    pwa.needRefresh = true;
    render(<UpdatePrompt />);

    fireEvent.click(screen.getByRole("button", { name: "Later" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(pwa.updateServiceWorker).not.toHaveBeenCalled();
  });

  it("says when the app is ready to work offline", () => {
    pwa.offlineReady = true;
    render(<UpdatePrompt />);

    expect(screen.getByRole("status")).toHaveTextContent("Ready to work offline.");
  });
});
