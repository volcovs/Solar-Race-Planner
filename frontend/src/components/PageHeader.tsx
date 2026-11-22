import type { ReactNode } from "react";
import { useDocumentTitle } from "../lib/useDocumentTitle";

/** Page heading; also sets the browser tab title. */
export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  useDocumentTitle(title);

  return (
    <header className="mb-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1>
      {children && <p className="mt-2 max-w-prose text-ink-muted">{children}</p>}
    </header>
  );
}
