// Stand-in for GET /layers/{name} until BE-10 serves Earth Engine tiles: real ESA WorldCover
// 10 m (2021, v200) tiles from Microsoft Planetary Computer, which renders them on request.

import type { LayerName, MapLayer } from "../lib/layers";

const API = "https://planetarycomputer.microsoft.com/api/data/v1/mosaic";
// ESA WorldCover is CC BY 4.0; the link leads to the full credit.
const CREDIT = "© ESA WorldCover 2021 / Copernicus Sentinel data";

// WorldCover classes: value, name, ESA's colour, and a typical roughness length z0 in metres
// (Wieringa 1993; WMO-No. 8). Provisional: DAT-05 owns the final table.
const CLASSES: [number, string, string, number][] = [
  [10, "Tree cover", "#006400", 0.8],
  [20, "Shrubland", "#ffbb22", 0.1],
  [30, "Grassland", "#ffff4c", 0.03],
  [40, "Cropland", "#f096ff", 0.1],
  [50, "Built-up", "#fa0000", 0.8],
  [60, "Bare / sparse vegetation", "#b4b4b4", 0.005],
  [70, "Snow and ice", "#f0f0f0", 0.001],
  [80, "Permanent water", "#0064c8", 0.0002],
  [90, "Herbaceous wetland", "#0096a0", 0.03],
  [95, "Mangroves", "#00cf75", 0.8],
  [100, "Moss and lichen", "#fae6a0", 0.01],
];

// z0 in five steps, light (smooth) to dark (rough).
const Z0_STEPS: [number, string, string][] = [
  [0.0002, "#ffffd4", "0.0002 m · water"],
  [0.01, "#fed98e", "≤ 0.01 m · bare, snow, moss"],
  [0.03, "#fe9929", "0.03 m · grass, wetland"],
  [0.1, "#d95f0e", "0.1 m · crops, shrubs"],
  [0.8, "#993404", "0.8 m · trees, mangroves, built-up"],
];
const z0Colour = (z0: number) => Z0_STEPS.find(([max]) => z0 <= max)![1];

export async function mockLayer(name: LayerName, signal?: AbortSignal): Promise<MapLayer> {
  const colours = Object.fromEntries(
    CLASSES.map(([value, , colour, z0]) => [value, rgba(name === "z0" ? z0Colour(z0) : colour)]),
  );
  const query = new URLSearchParams({ collection: "esa-worldcover", assets: "map", nodata: "0", colormap: JSON.stringify(colours) });
  return {
    name,
    tiles: [`${API}/${await searchId(signal)}/tiles/WebMercatorQuad/{z}/{x}/{y}?${query}`],
    minzoom: 6, // the tile service's limit for this collection
    attribution: CREDIT,
    attribution_url: "https://esa-worldcover.org",
    legend:
      name === "z0"
        ? Z0_STEPS.map(([, color, label]) => ({ label, color }))
        : CLASSES.map(([, label, color]) => ({ label, color })),
  };
}

/** Planetary Computer serves a mosaic by search; registering gives an ID (which can expire). */
async function searchId(signal?: AbortSignal): Promise<string> {
  const response = await fetch(`${API}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // The 2021 map (v200) only: the collection also holds 2020's.
    body: JSON.stringify({
      collections: ["esa-worldcover"],
      "filter-lang": "cql2-json",
      filter: { op: "=", args: [{ property: "esa_worldcover:product_version" }, "2.0.0"] },
    }),
    signal,
  });
  if (!response.ok) throw new Error(`Land cover tiles: ${response.status}`);
  return ((await response.json()) as { searchid: string }).searchid;
}

const rgba = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).concat(255);
