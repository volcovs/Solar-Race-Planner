import { LAYERS, type LayerName, type MapLayer } from "../../lib/layers";

export type LayerLoad =
  | { status: "off" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; layer: MapLayer };

/** Inside the map panel: pick a satellite layer and see its legend. The data credit is in the map's corner. */
export function LayerPicker({ load, onPick }: { load: LayerLoad; onPick: (name: LayerName | null) => void }) {
  const current = load.status === "ready" ? load.layer.name : load.status === "off" ? null : undefined;
  const options: [LayerName | null, string][] = [[null, "Off"], ...LAYERS.map(({ name, label }): [LayerName, string] => [name, label])];

  return (
    <div className="mt-3 border-t border-line pt-3">
      <div role="radiogroup" aria-label="Satellite layer" className="grid grid-cols-3 gap-0.5 rounded-control bg-surface-muted p-0.5">
        {options.map(([name, label]) => (
          <button
            key={label}
            type="button"
            role="radio"
            aria-checked={current === name}
            onClick={() => onPick(name)}
            className={`min-h-9 rounded-[8px] px-2 text-xs font-medium ${
              current === name ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {load.status === "loading" && <p className="mt-2 text-xs text-ink-muted">Loading…</p>}
      {load.status === "error" && (
        <p role="alert" className="mt-2 text-xs text-risk">
          Couldn't load the layer ({load.message}).
        </p>
      )}
      {load.status === "ready" && (
        // Folded on phones, where the legend would cover the map.
        <details open={!window.matchMedia?.("(max-width: 767px)").matches} className="mt-2">
          <summary className="cursor-pointer text-xs font-medium">
            Legend <span className="font-normal text-ink-muted">· from zoom {load.layer.minzoom}</span>
          </summary>
          <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
            {load.layer.legend.map(({ label, color }) => (
              <li key={label} className="flex items-center gap-1">
                <span className="size-2.5 shrink-0 rounded-sm border border-line" style={{ backgroundColor: color }} aria-hidden />
                {label}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
