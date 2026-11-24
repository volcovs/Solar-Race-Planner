// Stand-in for echarts/core in tests: jsdom has no canvas. Records what the app asks the chart to do.
import { vi } from "vitest";

type Handler = (event?: unknown) => void;

export class Chart {
  static instances: Chart[] = [];
  readonly handlers: Record<string, Handler[]> = {};
  readonly zrHandlers: Record<string, Handler[]> = {};
  option: { series?: unknown[] } = {};
  setOption = vi.fn((option: { series?: unknown[] }) => {
    this.option = option;
  });
  dispatchAction = vi.fn((action: { type: string; currTrigger?: string; x?: number }, opt?: { silent?: boolean }) => {
    // ECharts reports a pointer move with the axis value under it, unless silent; 1 px = 1 km here.
    if (action.type === "updateAxisPointer" && !opt?.silent) {
      const axesInfo = action.currTrigger === "leave" ? [] : [{ axisDim: "x", value: action.x }];
      this.emit("updateAxisPointer", { axesInfo });
    }
  });
  resize = vi.fn();
  dispose = vi.fn();

  constructor() {
    Chart.instances.push(this);
  }

  /** Fire a chart event as ECharts would. */
  emit(event: string, payload?: unknown) {
    for (const handler of this.handlers[event] ?? []) handler(payload);
  }
  on(event: string, handler: Handler) {
    (this.handlers[event] ??= []).push(handler);
  }
  getZr() {
    return { on: (event: string, handler: Handler) => (this.zrHandlers[event] ??= []).push(handler) };
  }
  getWidth() {
    return 1000;
  }
  getHeight() {
    return 400;
  }
  convertToPixel(_finder: { xAxisIndex: number }, km: number) {
    return km;
  }
}

export const init = () => new Chart();
export const use = () => {};
