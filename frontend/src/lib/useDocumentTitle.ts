import { useEffect } from "react";

/** Sets the browser tab title for the current page. */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = `${title} · Solar Race Planner`;
  }, [title]);
}
