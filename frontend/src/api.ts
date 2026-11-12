// Deployed builds set VITE_API_URL to the API URL; in dev, /api is proxied to localhost:8000.
const BASE = import.meta.env.VITE_API_URL || "/api";

export interface Health {
  status: string;
  version: string;
}

export async function getHealth(): Promise<Health> {
  const res = await fetch(`${BASE}/health`);
  if (!res.ok) throw new Error(`/health: ${res.status}`);
  return res.json() as Promise<Health>;
}
