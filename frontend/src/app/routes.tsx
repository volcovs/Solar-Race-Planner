import type { RouteObject } from "react-router";
import { NotFoundPage } from "../pages/NotFoundPage";
import { PlaceholderPage } from "../pages/PlaceholderPage";
import { AppLayout } from "./AppLayout";
import { SECTIONS } from "./navigation";

// When a section's real page exists, give it its own route here instead of the placeholder.
export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    children: [
      ...SECTIONS.map((section) => ({ path: section.path, element: <PlaceholderPage section={section} /> })),
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];
