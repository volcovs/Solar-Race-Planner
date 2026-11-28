// About the app itself: name, source, credits.

export const APP_NAME = "Solar Race Planner";
export const REPO_URL = import.meta.env.VITE_REPO_URL || "https://github.com/volcovs/Solar-Race-Planner";
export const ISSUES_URL = `${REPO_URL}/issues`;

export const LAST_UPDATE = new Date(__LAST_UPDATE__);

/** The open data the app is built on, with the credit each licence asks for. */
export const DATA_SOURCES: { what: string; source: string; url: string; licence: string }[] = [
  {
    what: "Route and base map",
    source: "© OpenStreetMap contributors",
    url: "https://www.openstreetmap.org/copyright",
    licence: "ODbL",
  },
  {
    what: "Map tiles",
    source: "OpenFreeMap, © OpenMapTiles",
    url: "https://openfreemap.org",
    licence: "free, no key",
  },
  {
    what: "Weather forecasts",
    source: "Open-Meteo",
    url: "https://open-meteo.com",
    licence: "CC BY 4.0",
  },
  {
    what: "Land cover",
    source: "© ESA WorldCover project / Copernicus Sentinel data",
    url: "https://esa-worldcover.org",
    licence: "CC BY 4.0",
  },
];
