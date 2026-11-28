import { lazy, Suspense, type ReactNode } from "react";
import type { RouteObject } from "react-router";
import { CarPage } from "../pages/CarPage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { OverviewPage } from "../pages/OverviewPage";
import { PlanPage } from "../pages/PlanPage";
import { ReplanPage } from "../pages/ReplanPage";
import { WhatIfPage } from "../pages/WhatIfPage";
import { AppLayout } from "./AppLayout";
import { SECTIONS } from "./navigation";

// The map library is large, so the map page loads only when it's opened.
const MapPage = lazy(() => import("../pages/MapPage").then((m) => ({ default: m.MapPage })));

/** The page for each section in navigation.ts. */
const PAGES: Record<string, ReactNode> = {
  "/": <OverviewPage />,
  "/plan": <PlanPage />,
  "/replan": <ReplanPage />,
  "/what-if": <WhatIfPage />,
  "/car": <CarPage />,
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
        element: PAGES[section.path],
      })),
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];
