import { CarFront, LayoutDashboard, ListOrdered, Map, RefreshCw, SlidersHorizontal, type LucideIcon } from "lucide-react";

export interface Section {
  path: string;
  label: string; // short, for the navigation
  title: string; // the page's heading
  icon: LucideIcon;
}

/** One list drives the sidebar, the phone tab bar and the routes. */
export const SECTIONS: Section[] = [
  {
    path: "/",
    label: "Overview",
    title: "Race overview",
    icon: LayoutDashboard,
  },
  {
    path: "/plan",
    label: "Plan",
    title: "Race plan",
    icon: ListOrdered,
  },
  {
    path: "/map",
    label: "Map",
    title: "Route map",
    icon: Map,
  },
  {
    path: "/what-if",
    label: "What-if",
    title: "What-if scenarios",
    icon: SlidersHorizontal,
  },
  {
    path: "/replan",
    label: "Re-plan",
    title: "Re-plan from here",
    icon: RefreshCw,
  },
  {
    path: "/car",
    label: "Car",
    title: "Car profile",
    icon: CarFront,
  },
];
