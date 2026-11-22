import { LayoutDashboard, ListOrdered, Map, RefreshCw, SlidersHorizontal, type LucideIcon } from "lucide-react";

export interface Section {
  path: string;
  label: string; // short, for the navigation
  title: string; // page heading
  description: string; // what the page will show; used by the placeholder until it is built
  icon: LucideIcon;
}

/** One list drives the sidebar, the phone tab bar and the routes. */
export const SECTIONS: Section[] = [
  {
    path: "/",
    label: "Overview",
    title: "Race overview",
    description: "Plan summary, route map and battery timeline in one view, once a plan has been run.",
    icon: LayoutDashboard,
  },
  {
    path: "/plan",
    label: "Plan",
    title: "Race plan",
    description: "Target speed per stage, arrival times at each control stop and the expected end-of-day position.",
    icon: ListOrdered,
  },
  {
    path: "/map",
    label: "Map",
    title: "Route map",
    description: "The route coloured by planned speed, sunshine or headwind, with control stops and the car's position.",
    icon: Map,
  },
  {
    path: "/what-if",
    label: "What-if",
    title: "What-if scenarios",
    description: "Compare plans for a different start battery, earlier or later clouds, or more drag.",
    icon: SlidersHorizontal,
  },
  {
    path: "/replan",
    label: "Re-plan",
    title: "Re-plan from here",
    description: "Enter where the car is and its battery level, and get a new plan for the rest of the route.",
    icon: RefreshCw,
  },
];
