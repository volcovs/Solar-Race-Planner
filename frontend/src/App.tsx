import { useEffect, useState } from "react";
import { getHealth, type Health } from "./api";

export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getHealth()
      .then(setHealth)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <main>
      <h1>Solar Race Planner</h1>
      {health && <p>API {health.status} · v{health.version}</p>}
      {error && <p role="alert">API unavailable: {error}</p>}
    </main>
  );
}
