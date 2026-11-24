import { lazy, Suspense, type ReactNode } from "react";
import type { RouteObject } from "react-router";
import { NotFoundPage } from "../pages/NotFoundPage";
import { PlanPage } from "../pages/PlanPage";
import { PlaceholderPage } from "../pages/PlaceholderPage";
import { AppLayout } from "./AppLayout";
import { SECTIONS } from "./navigation";

// The map library is large, so the map page loads only when it's opened.
const MapPage = lazy(() => import("../pages/MapPage").then((m) => ({ default: m.MapPage })));

/** Sections whose real page exists; the others show a placeholder. */
const PAGES: Record<string, ReactNode> = {
  "/plan": <PlanPage />,
  "/map": (
    <Suspense fallback={<div className="flex-1 bg-surface-muted" />}>
      <MapPage />
    </Suspense>
  ),
};

export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    children: [
      ...SECTIONS.map((section) => ({
        path: section.path,
        element: PAGES[section.path] ?? <PlaceholderPage section={section} />,
      })),
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];
