/**
 * A change, rounded, with its sign; red when it moves the `worse` way, green the other way.
 * Without `worse` it's neutral (a different speed is neither good nor bad on its own).
 */
export function Delta({ change, format, worse }: { change: number; format: (n: number) => string; worse?: "up" | "down" }) {
  const n = Math.round(change);
  if (n === 0) return <span className="text-ink-muted">no change</span>;
  const tone = !worse ? "text-ink-muted" : (n > 0) === (worse === "up") ? "text-risk" : "text-good";
  return (
    <span className={tone}>
      {n > 0 ? "+" : "−"}
      {format(Math.abs(n))}
    </span>
  );
}

export const pts = (n: number) => `${n} pts`;
export const duration = (minutes: number) =>
  minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ""}`;
