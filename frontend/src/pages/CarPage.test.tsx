import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routes } from "../app/routes";
import { currentCar, REFERENCE_CAR } from "../lib/car";

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ status: "ok", version: "0.1.0" }) })));
});
afterEach(() => vi.unstubAllGlobals());

const openCar = () => render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ["/car"] })} />);
const input = (label: string) => screen.getByLabelText(label, { exact: false });
const status = () => screen.getAllByRole("status").at(-1)!; // the header's API pill is a status too

describe("CarPage", () => {
  it("shows the reference car with units, and efficiencies as percentages", () => {
    openCar();
    expect(input("Drag area (CdA)")).toHaveValue(0.1);
    expect(input("Drivetrain efficiency")).toHaveValue(95);
    expect(screen.getByText("Drag area (CdA)").parentElement).toHaveTextContent("Drag area (CdA), m²");
    expect(status()).toHaveTextContent("Using the reference car.");
  });

  it("checks each value as it's typed, and only saves a valid profile", () => {
    openCar();
    fireEvent.change(input("Drivetrain efficiency"), { target: { value: "140" } });

    expect(input("Drivetrain efficiency")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Above 0 up to 100 %.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.change(input("Drivetrain efficiency"), { target: { value: "90" } });
    fireEvent.change(input("Profile name"), { target: { value: "ours" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(currentCar()).toMatchObject({ name: "ours", drivetrain_eff: 0.9 });
    expect(status()).toHaveTextContent("Saved in this browser.");
  });

  it("loads a profile from JSON, and refuses one that isn't valid", async () => {
    openCar();
    // jsdom's File has no text(), which every browser has.
    const file = (name: string, text: string) => Object.assign(new File([text], name), { text: async () => text });
    const load = (name: string, text: string) =>
      fireEvent.change(screen.getByLabelText("Profile file"), { target: { files: [file(name, text)] } });

    load("broken.json", "{");
    await waitFor(() => expect(status()).toHaveTextContent("broken.json isn't JSON."));

    load("odd.json", JSON.stringify({ ...REFERENCE_CAR, crr: 2 }));
    await waitFor(() => expect(status()).toHaveTextContent("odd.json isn't a valid profile (crr: From 0.001 up to 0.05.)"));

    load("ours.json", JSON.stringify({ ...REFERENCE_CAR, name: "ours", cda_m2: 0.11 }));
    await waitFor(() => expect(input("Drag area (CdA)")).toHaveValue(0.11));
    expect(status()).toHaveTextContent("Loaded ours.json. Save to use it.");
    expect(currentCar()).toBe(REFERENCE_CAR); // not until saved
  });

  it("goes back to the reference car", () => {
    localStorage.setItem("srp-car-profile", JSON.stringify({ ...REFERENCE_CAR, name: "ours" }));
    openCar();
    fireEvent.click(screen.getByRole("button", { name: "Reset to reference" }));

    expect(currentCar()).toBe(REFERENCE_CAR);
    expect(input("Profile name")).toHaveValue("reference-car");
  });
});
