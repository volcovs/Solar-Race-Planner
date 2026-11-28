// GET /layers/{name} (BE-10): a raster layer to draw under the route.

export type LayerName = "landcover" | "z0";

export const LAYERS: { name: LayerName; label: string }[] = [
  { name: "landcover", label: "Land cover" },
  { name: "z0", label: "Roughness z0" },
];

export interface MapLayer {
  name: LayerName;
  tiles: string[];
  minzoom: number; // no tiles below this zoom // XYZ URL templates ({z}/{x}/{y}); they can expire, so ask again on each use
  attribution: string; // the dataset's required credit, plain text
  attribution_url: string;
  legend: { label: string; color: string }[];
}
