import type { ForecastResponse, PlanResponse } from "./plan";

// Deployed builds set VITE_API_URL to the API URL; in dev, /api is proxied to localhost:8000.
const BASE = import.meta.env.VITE_API_URL || "/api";

// The API has no /plan or /forecast yet (BE-04): until it does, they come from src/mocks.
// Build with VITE_API_MOCK=false to call the real ones.
const MOCK_API = import.meta.env.VITE_API_MOCK !== "false";

export interface Health {
  status: string;
  version: string;
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { signal });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

/** Imported on demand, so a build without mocks doesn't include them. */
async function getMock<T>(path: "/plan" | "/forecast"): Promise<T> {
  const { mockResponse } = await import("../mocks/api");
  return mockResponse(path) as Promise<T>;
}

export const getHealth = () => getJson<Health>("/health");

export const getPlan = (signal?: AbortSignal) =>
  MOCK_API ? getMock<PlanResponse>("/plan") : getJson<PlanResponse>("/plan", signal);

export const getForecast = (signal?: AbortSignal) =>
  MOCK_API ? getMock<ForecastResponse>("/forecast") : getJson<ForecastResponse>("/forecast", signal);
