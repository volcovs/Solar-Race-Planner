import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UpdatePrompt } from "./UpdatePrompt";

/** A stand-in service worker (jsdom has none), with listeners the test can fire. */
function worker(state = "installed") {
  const listeners: (() => void)[] = [];
  return {
    state,
    postMessage: vi.fn(),
    addEventListener: (_: string, fn: () => void) => listeners.push(fn),
    become(next: string) {
      this.state = next;
      listeners.forEach((fn) => fn());
    },
  };
}

/** navigator.serviceWorker with a registration; `controller` set means a version is already in charge. */
function serviceWorkers({ controller, waiting = null }: { controller: boolean; waiting?: ReturnType<typeof worker> | null }) {
  const onUpdate: (() => void)[] = [];
  const registration = {
    waiting,
    installing: null as ReturnType<typeof worker> | null,
    update: vi.fn(),
    addEventListener: (_: string, fn: () => void) => onUpdate.push(fn),
  };
  const container = { controller: controller ? {} : null, register: vi.fn(async () => registration), addEventListener: vi.fn() };
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: container });
  return {
    container,
    install(next: ReturnType<typeof worker>) {
      registration.installing = next;
      onUpdate.forEach((fn) => fn());
    },
  };
}

afterEach(() => {
  delete (navigator as { serviceWorker?: unknown }).serviceWorker;
});

describe("UpdatePrompt", () => {
  it("offers a waiting new version, and only switches to it when asked", async () => {
    const next = worker();
    const { container } = serviceWorkers({ controller: true, waiting: next });
    render(<UpdatePrompt />);

    expect(await screen.findByRole("status")).toHaveTextContent("A new version of the app is available.");
    expect(container.register).toHaveBeenCalledWith("/sw.js");
    expect(next.postMessage).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(next.postMessage).toHaveBeenCalledWith("skip-waiting");
    expect(container.addEventListener).toHaveBeenCalledWith("controllerchange", expect.any(Function));
  });

  it("can be put off", async () => {
    serviceWorkers({ controller: true, waiting: worker() });
    render(<UpdatePrompt />);

    fireEvent.click(await screen.findByRole("button", { name: "Later" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("says when the first install has saved the app for offline", async () => {
    const sw = serviceWorkers({ controller: false });
    render(<UpdatePrompt />);
    await act(() => Promise.resolve()); // registered

    const first = worker("installing");
    act(() => sw.install(first));
    act(() => first.become("installed"));

    expect(screen.getByRole("status")).toHaveTextContent("Ready to work offline.");
  });
});
