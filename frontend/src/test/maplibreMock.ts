// Stand-in for maplibre-gl in tests: jsdom has no WebGL. Records what the app asks the map to do.
import { vi } from "vitest";

type Handler = (event?: unknown) => void;

export class Map {
  static instances: Map[] = [];
  readonly handlers: Record<string, Handler[]> = {};
  readonly sources = new globalThis.Map<string, { spec: unknown; setData: ReturnType<typeof vi.fn> }>();
  readonly layers = new Set<string>();
  readonly before: Record<string, string | undefined> = {}; // layer id → the layer it went under
  readonly controls: { onAdd: (map: Map) => HTMLElement }[] = [];
  setStyle = vi.fn();
  fitBounds = vi.fn();
  setFeatureState = vi.fn();
  easeTo = vi.fn();
  getBounds = vi.fn(() => ({ contains: () => true }));
  queryRenderedFeatures = vi.fn((): { id?: number }[] => []);

  constructor(readonly options: { style: string }) {
    Map.instances.push(this);
  }

  /** Fire a map event as MapLibre would. */
  emit(event: string, payload?: unknown) {
    for (const handler of this.handlers[event] ?? []) handler(payload);
  }

  on(event: string, handler: Handler) {
    (this.handlers[event] ??= []).push(handler);
    return this;
  }
  addControl(control: { onAdd?: (map: Map) => HTMLElement }) {
    if (control.onAdd) this.controls.push(control as { onAdd: (map: Map) => HTMLElement });
    return this;
  }
  addSource(id: string, spec?: unknown) {
    this.sources.set(id, { spec, setData: vi.fn() });
  }
  addLayer({ id }: { id: string }, beforeId?: string) {
    this.layers.add(id);
    this.before[id] = beforeId;
  }
  removeSource(id: string) {
    this.sources.delete(id);
  }
  removeLayer(id: string) {
    this.layers.delete(id);
  }
  getStyle() {
    return { layers: [...this.layers].map((id) => ({ id, type: "line" })) };
  }
  getSource(id: string) {
    return this.sources.get(id);
  }
  getLayer(id: string) {
    return this.layers.has(id) ? {} : undefined;
  }
  getCanvas() {
    return document.createElement("canvas");
  }
  remove() {}
}

export class NavigationControl {}

export const setWorkerUrl = vi.fn();
