import type { ReactNode } from "react";

/** Centred, padded column for normal pages. Full-screen pages such as a map leave it out. */
export function PageContainer({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-[1280px] px-4 py-6 md:px-6 md:py-8">{children}</div>;
}
