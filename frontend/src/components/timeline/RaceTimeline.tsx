import { LineChart } from "echarts/charts";
import { AxisPointerComponent, GridComponent, MarkAreaComponent, MarkLineComponent } from "echarts/components";
import { init, use, type EChartsCoreOption, type EChartsType } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";
import { sample, type ForecastResponse, type PlanResponse } from "../../lib/plan";
import { placeName, type Stop } from "../../lib/route";
import { readToken, useTheme } from "../../lib/theme";

use([LineChart, GridComponent, AxisPointerComponent, MarkLineComponent, MarkAreaComponent, CanvasRenderer]);

/** The km both views point at; `from` lets each view skip echoing its own moves. */
export type Cursor = { km: number; from: "map" | "timeline" } | null;

interface Props {
  plan: PlanResponse;
  forecast: ForecastResponse;
  stops: Stop[];
  cursor: Cursor;
  onCursor: (km: number | null) => void;
  onPick: (km: number) => void;
}

const KEY_STEP_KM = 10;

/** Battery, speed, sun and wind along km in stacked panels, with a cursor shared with the map. */
export function RaceTimeline({ plan, forecast, stops, cursor, onCursor, onPick }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | null>(null);
  const theme = useTheme();
  const latest = useRef({ plan, forecast, stops, cursor, onCursor, onPick });
  latest.current = { plan, forecast, stops, cursor, onCursor, onPick };

  const draw = () => {
    const chart = chartRef.current;
    const { plan, forecast, stops } = latest.current;
    if (chart) chart.setOption(buildOption(plan, forecast, stops, chart.getWidth(), chart.getHeight()), { notMerge: true });
  };

  /** Move the pointer without an event, so the move isn't echoed back as a new cursor. */
  const movePointer = (km: number | null) => {
    const chart = chartRef.current;
    if (!chart) return;
    if (km === null) {
      chart.dispatchAction({ type: "updateAxisPointer", currTrigger: "leave" }, { silent: true });
    } else {
      // A pointer exactly on the panel's edge counts as outside it.
      const x = Math.min(Math.max(chart.convertToPixel({ xAxisIndex: 0 }, km), LEFT_PX + 1), chart.getWidth() - RIGHT_PX - 1);
      chart.dispatchAction({ type: "updateAxisPointer", currTrigger: "mousemove", x, y: TOP_PX + 10 }, { silent: true });
    }
  };

  useEffect(() => {
    const el = container.current!;
    const chart = init(el);
    chartRef.current = chart;
    chart.on("updateAxisPointer", (event) => {
      const x = (event as { axesInfo: { axisDim: string; value: number }[] }).axesInfo.find((a) => a.axisDim === "x");
      latest.current.onCursor(x ? x.value : null);
    });
    chart.getZr().on("click", () => {
      const km = latest.current.cursor?.km;
      if (km !== undefined) latest.current.onPick(km);
    });
    const resize = new ResizeObserver(() => {
      chart.resize();
      draw(); // panel heights are in pixels
    });
    resize.observe(el);
    return () => {
      resize.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(draw, [plan, forecast, stops, theme]);

  useEffect(() => {
    if (cursor?.from !== "timeline") movePointer(cursor?.km ?? null);
  }, [cursor]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const end = plan.km[plan.km.length - 1];
    const km = latest.current.cursor?.km ?? 0; // not `cursor`: key repeat can outrun re-renders
    const step = e.shiftKey ? KEY_STEP_KM * 10 : KEY_STEP_KM;
    const next = { ArrowRight: km + step, ArrowLeft: km - step, Home: 0, End: end }[e.key];
    if (next !== undefined) {
      e.preventDefault();
      const clamped = Math.min(end, Math.max(0, next));
      latest.current.cursor = { km: clamped, from: "timeline" };
      onCursor(clamped);
      movePointer(clamped);
    } else if (e.key === "Enter" && cursor) {
      onPick(cursor.km);
    } else if (e.key === "Escape") {
      onCursor(null);
      movePointer(null);
    }
  };

  return (
    <div
      ref={container}
      role="img"
      tabIndex={0}
      onKeyDown={onKeyDown}
      aria-label="Battery, target speed, sunshine and headwind along the route. Arrow keys move along it, Enter shows that stretch on the map."
      className="size-full rounded-control"
    />
  );
}

// Pixels. Above the first panel: a row of day names, then stop names and the panel's title.
const TOP_PX = 44;
const DAY_ROW_PX = 22;
const GAP_PX = 22; // between panels, for their titles
const BOTTOM_PX = 26; // km labels
const LEFT_PX = 52;
const RIGHT_PX = 16;
const MIN_PX_PER_STOP_NAME = 90;

const PANELS = [
  { title: "Battery %", weight: 2 },
  { title: "Target speed, km/h", weight: 1 },
  { title: "Irradiance, W/m²", weight: 1 },
  { title: "Headwind, m/s", weight: 1 },
];

const kmLabel = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });

function buildOption(
  plan: PlanResponse,
  forecast: ForecastResponse,
  stops: Stop[],
  width: number,
  height: number,
): EChartsCoreOption {
  const c = {
    ink: readToken("--ink"),
    muted: readToken("--ink-muted"),
    line: readToken("--line"),
    shade: readToken("--surface-muted"),
    battery: readToken("--battery"),
    band: readToken("--battery-band"),
    sun: readToken("--sun"),
    risk: readToken("--risk"),
    good: readToken("--good"),
  };
  const font = { fontFamily: "Inter Variable, system-ui, sans-serif", fontSize: 11, color: c.muted };
  const controlStops = stops.filter((s) => s.kind === "control_stop");
  const nameStops = (width - LEFT_PX - RIGHT_PX) / Math.max(1, controlStops.length) >= MIN_PX_PER_STOP_NAME;

  const totalWeight = PANELS.reduce((sum, p) => sum + p.weight, 0);
  const free = Math.max(0, height - TOP_PX - BOTTOM_PX - GAP_PX * (PANELS.length - 1));
  let top = TOP_PX;
  const grid = PANELS.map((p) => {
    const g = { left: LEFT_PX, right: RIGHT_PX, top, height: (free * p.weight) / totalWeight };
    top += g.height + GAP_PX;
    return g;
  });

  const last = PANELS.length - 1;
  const xAxis = PANELS.map((_, i) => ({
    type: "value",
    gridIndex: i,
    min: 0,
    max: plan.km[plan.km.length - 1],
    axisLine: { show: i === last, lineStyle: { color: c.line } },
    axisTick: { show: false },
    splitLine: { show: false },
    splitNumber: Math.max(2, Math.floor(width / 140)),
    axisLabel: { show: i === last, hideOverlap: true, ...font, formatter: (km: number) => `${kmLabel.format(km)} km` },
    axisPointer: { show: true, snap: false, label: { show: false }, lineStyle: { color: c.ink, width: 1 } },
  }));

  const yAxis = PANELS.map((p, i) => ({
    type: "value",
    gridIndex: i,
    name: p.title,
    nameGap: 6,
    nameTextStyle: { ...font, color: c.ink, fontWeight: 600, align: "left", padding: [0, 0, 0, 4 - LEFT_PX] },
    splitNumber: i === 0 ? 4 : 2,
    axisLabel: font,
    splitLine: { lineStyle: { color: c.line } },
    ...[{ min: 0, max: 100 }, { scale: true }, { min: 0 }, { scale: true }][i],
  }));

  // Days as alternating bands and control stops as dotted lines in every panel; the top one names them.
  const markers = (top: boolean) => ({
    markArea: {
      silent: true,
      label: { show: top, position: "insideTopLeft", offset: [0, -DAY_ROW_PX - 12], ...font },
      data: plan.days.map((d) => [
        { xAxis: d.start_km, name: `Day ${d.day}`, itemStyle: { color: d.day % 2 === 0 ? c.shade : "transparent" } },
        { xAxis: d.end_km },
      ]),
    },
    markLine: {
      silent: true,
      symbol: "none",
      lineStyle: { color: c.muted, type: "dotted", width: 1 },
      label: { show: top && nameStops, position: "end", formatter: "{b}", ...font, color: c.ink },
      data: controlStops.map((s) => ({ xAxis: s.km, name: placeName(s.name) })),
    },
  });

  // Drawn every km; the cursor card reads the full data.
  const along = (kms: number[], values: number[], scale = 1) => sample(kms, values.map((v) => v * scale));
  const line = (panel: number, data: [number, number][], color: string, extra = {}) => ({
    type: "line",
    xAxisIndex: panel,
    yAxisIndex: panel,
    data,
    symbol: "none",
    silent: true,
    lineStyle: { color, width: 1.5 },
    ...extra,
  });
  const wind = along(forecast.km, forecast.headwind_ms);
  const bandWidth = plan.soc_p90.map((p90, i) => p90 - plan.soc_p10[i]);

  return {
    animation: false,
    textStyle: font,
    grid,
    xAxis,
    yAxis,
    axisPointer: { link: [{ xAxisIndex: "all" }], triggerOn: "mousemove" },
    series: [
      // The P10–P90 band: an invisible floor at P10 with the band's width stacked on top.
      line(0, along(plan.km, plan.soc_p10, 100), "transparent", { stack: "band", ...markers(true) }),
      line(0, along(plan.km, bandWidth, 100), "transparent", { stack: "band", areaStyle: { color: c.band, opacity: 1 } }),
      line(0, along(plan.km, plan.soc, 100), c.battery, { lineStyle: { color: c.battery, width: 2 } }),
      line(1, along(plan.km, plan.speed_kmh), c.ink, markers(false)),
      line(2, along(forecast.km, forecast.ghi_w_m2), c.sun, { areaStyle: { color: c.sun, opacity: 0.18 }, ...markers(false) }),
      line(3, wind.map(([km, w]) => [km, Math.max(0, w)]), c.risk, { areaStyle: { color: c.risk, opacity: 0.15 }, ...markers(false) }),
      line(3, wind.map(([km, w]) => [km, Math.min(0, w)]), c.good, { areaStyle: { color: c.good, opacity: 0.15 } }),
    ],
  };
}
