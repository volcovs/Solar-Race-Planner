// Stand-in for maplibre-gl in tests: jsdom has no WebGL. Records what the app asks the map to do.
import { vi } from "vitest";

type Handler = (event?: unknown) => void;

export class Map {
  static instances: Map[] = [];
  readonly handlers: Record<string, Handler[]> = {};
  readonly sources = new globalThis.Map<string, { setData: ReturnType<typeof vi.fn> }>();
  readonly layers = new Set<string>();
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
  addSource(id: string) {
    this.sources.set(id, { setData: vi.fn() });
  }
  addLayer({ id }: { id: string }) {
    this.layers.add(id);
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
