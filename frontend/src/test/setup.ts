import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Testing Library only cleans up by itself when Vitest globals are on; they are off here.
afterEach(cleanup);

// jsdom has no WebGL, so every test gets the recording stand-in for maplibre-gl.
vi.mock("maplibre-gl", () => import("./maplibreMock"));
