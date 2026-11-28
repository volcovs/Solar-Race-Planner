import { bounds, pointAtKm, type LonLat } from "../../lib/geo";
import { placeName, type RouteData } from "../../lib/route";

const SIZE = 100; // the longer side, in drawing units
const MAX_POINTS = 400;

/** The route's outline with its stops and, during the race, where the plan puts the car. */
export function RouteSketch({ route, km }: { route: RouteData; km: number | null }) {
  const [[west, south], [east, north]] = bounds(route.line);
  const xScale = Math.cos((((south + north) / 2) * Math.PI) / 180); // keep the shape at this latitude
  const scale = SIZE / Math.max((east - west) * xScale, north - south);
  const project = ([lon, lat]: LonLat) => [(lon - west) * xScale * scale, (north - lat) * scale] as const;
  const [width, height] = [(east - west) * xScale * scale, (north - south) * scale];

  const step = Math.ceil(route.line.length / MAX_POINTS);
  const points = route.line.filter((_, i) => i % step === 0 || i === route.line.length - 1).map(project);
  const car = km === null ? undefined : project(pointAtKm(route.line, route.cumKm, km));
  const ends = [route.stops[0], route.stops.at(-1)].filter((s) => s !== undefined);

  return (
    <svg viewBox={`-24 -6 ${width + 48} ${height + 12}`} className="h-full max-h-80 w-full" role="img" aria-label="Route outline">
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke="var(--route)"
        strokeWidth={3}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {route.stops.map((stop) => {
        const [x, y] = project(stop.position);
        return <circle key={stop.name} cx={x} cy={y} r={1.6} fill="var(--surface)" stroke="var(--ink)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />;
      })}
      {ends.map((stop) => {
        const [x, y] = project(stop.position);
        return (
          <text key={stop.name} x={x + 3} y={y + 1.5} fontSize={4.5} fill="var(--ink)" fontWeight={600}>
            {placeName(stop.name)}
          </text>
        );
      })}
      {car && <circle cx={car[0]} cy={car[1]} r={2.6} fill="var(--brand)" stroke="var(--surface)" strokeWidth={2} vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}
