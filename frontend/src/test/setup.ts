import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Testing Library only cleans up by itself when Vitest globals are on; they are off here.
afterEach(cleanup);

// jsdom has no WebGL or canvas, so every test gets recording stand-ins for the map and the chart.
vi.mock("maplibre-gl", () => import("./maplibreMock"));
vi.mock("echarts/core", () => import("./echartsMock"));
vi.mock("virtual:pwa-register/react", () => import("./pwaMock"));
// The parts the chart installs; the stand-in ignores them, so skip loading the real (large) ones.
vi.mock("echarts/charts", () => ({ LineChart: {} }));
vi.mock("echarts/components", () => ({ AxisPointerComponent: {}, GridComponent: {}, MarkAreaComponent: {}, MarkLineComponent: {} }));
vi.mock("echarts/renderers", () => ({ CanvasRenderer: {} }));

// jsdom has no ResizeObserver; nothing in the tests resizes.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
