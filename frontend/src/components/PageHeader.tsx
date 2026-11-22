import { useEffect, type ReactNode } from "react";

/** Page heading; also sets the browser tab title. */
export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  useEffect(() => {
    document.title = `${title} · Solar Race Planner`;
  }, [title]);

  return (
    <header className="mb-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1>
      {children && <p className="mt-2 max-w-prose text-ink-muted">{children}</p>}
    </header>
  );
}
