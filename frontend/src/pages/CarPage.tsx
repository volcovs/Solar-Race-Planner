import { Download, RotateCcw, Upload } from "lucide-react";
import { useId, useRef, useState, type ChangeEvent } from "react";
import { PageContainer } from "../components/PageContainer";
import { PageHeader } from "../components/PageHeader";
import {
  FIELDS,
  GROUPS,
  REFERENCE_CAR,
  fieldError,
  fieldKey,
  getValue,
  saveCar,
  useCar,
  validate,
  type CarProfile,
  type Field,
} from "../lib/car";

/** The form's text for each field, in shown units (efficiencies as %). */
type Draft = Record<string, string>;

const toDraft = (car: CarProfile): Draft => ({
  name: car.name,
  ...Object.fromEntries(FIELDS.map((f) => [fieldKey(f), String(Number((getValue(car, f) * f.scale).toPrecision(10)))])),
});

function fromDraft(draft: Draft): CarProfile {
  const value = (path: string) => {
    const f = FIELDS.find((f) => fieldKey(f) === path)!;
    return Number(draft[path]) / f.scale;
  };
  return {
    name: draft.name.trim(),
    mass_kg: value("mass_kg"),
    cda_m2: value("cda_m2"),
    crr: value("crr"),
    drivetrain_eff: value("drivetrain_eff"),
    max_speed_kmh: value("max_speed_kmh"),
    array: { area_m2: value("array.area_m2"), efficiency: value("array.efficiency"), temp_coeff_per_c: value("array.temp_coeff_per_c") },
    battery: {
      capacity_wh: value("battery.capacity_wh"),
      min_soc: value("battery.min_soc"),
      charge_eff: value("battery.charge_eff"),
      discharge_eff: value("battery.discharge_eff"),
    },
  };
}

function draftErrors(draft: Draft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (draft.name.trim() === "") errors.name = "Give the profile a name.";
  for (const f of FIELDS) {
    const text = draft[fieldKey(f)].trim();
    const error = text === "" ? "Enter a number." : fieldError(f, Number(text));
    if (error) errors[fieldKey(f)] = error;
  }
  return errors;
}

/** Edit the car the planner uses; kept in this browser, saved and loaded as JSON. */
export function CarPage() {
  const saved = useCar();
  const [draft, setDraft] = useState<Draft>(() => toDraft(saved));
  const [notice, setNotice] = useState<{ text: string; risk?: boolean }>();
  const fileInput = useRef<HTMLInputElement>(null);

  const errors = draftErrors(draft);
  const valid = Object.keys(errors).length === 0;
  const unsaved = JSON.stringify(draft) !== JSON.stringify(toDraft(saved));
  const isReference = JSON.stringify(saved) === JSON.stringify(REFERENCE_CAR);

  const edit = (key: string) => (e: ChangeEvent<HTMLInputElement>) => {
    setDraft({ ...draft, [key]: e.target.value });
    setNotice(undefined);
  };

  const save = () => {
    saveCar(fromDraft(draft));
    setNotice({ text: "Saved in this browser. The next plan requests use it." });
  };

  const reset = () => {
    saveCar(null);
    setDraft(toDraft(REFERENCE_CAR));
    setNotice({ text: "Back to the reference car." });
  };

  const download = () => {
    const car = fromDraft(draft);
    const url = URL.createObjectURL(new Blob([JSON.stringify(car, null, 2)], { type: "application/json" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: `${car.name || "car"}.json` });
    link.click();
    URL.revokeObjectURL(url);
  };

  const load = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // so the same file can be chosen again
    if (!file) return;
    try {
      const profile = JSON.parse(await file.text());
      const problems = validate(profile);
      if (Object.keys(problems).length > 0) {
        const [field, problem] = Object.entries(problems)[0];
        setNotice({ text: `${file.name} isn't a valid profile (${field}: ${problem})`, risk: true });
        return;
      }
      setDraft(toDraft(profile));
      setNotice({ text: `Loaded ${file.name}. Save to use it.` });
    } catch {
      setNotice({ text: `${file.name} isn't JSON.`, risk: true });
    }
  };

  return (
    <PageContainer>
      <PageHeader title="Car profile">
        Kept in this browser only. It goes to the planner with each plan request and is never stored on the server.
      </PageHeader>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) save();
        }}
        noValidate
      >
        <TextField label="Profile name" value={draft.name} error={errors.name} onChange={edit("name")} />

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {GROUPS.map((group) => (
            <fieldset key={group.title} className="rounded-card border border-line bg-surface p-5">
              <legend className="float-left mb-3 w-full font-display text-xl font-semibold">{group.title}</legend>
              <div className="clear-both space-y-4">
                {group.fields.map((f) => (
                  <NumberField key={fieldKey(f)} field={f} value={draft[fieldKey(f)]} error={errors[fieldKey(f)]} onChange={edit(fieldKey(f))} />
                ))}
              </div>
            </fieldset>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button type="submit" disabled={!valid || !unsaved} className="h-12 rounded-control bg-brand px-6 font-medium text-on-brand disabled:opacity-50">
            Save
          </button>
          <button type="button" onClick={download} disabled={!valid} className={SECONDARY}>
            <Download className="size-4" aria-hidden />
            Download JSON
          </button>
          <button type="button" onClick={() => fileInput.current?.click()} className={SECONDARY}>
            <Upload className="size-4" aria-hidden />
            Load JSON
          </button>
          <input ref={fileInput} type="file" accept="application/json,.json" onChange={load} className="hidden" aria-label="Profile file" />
          {!isReference && (
            <button type="button" onClick={reset} className={SECONDARY}>
              <RotateCcw className="size-4" aria-hidden />
              Reset to reference
            </button>
          )}
        </div>
        <p role="status" className={`mt-3 min-h-6 text-sm ${notice?.risk ? "text-risk" : "text-ink-muted"}`}>
          {notice?.text ?? (unsaved ? "Unsaved changes." : isReference ? "Using the reference car." : `Using ${saved.name}.`)}
        </p>
      </form>
    </PageContainer>
  );
}

const SECONDARY =
  "inline-flex h-12 items-center gap-2 rounded-control border border-line px-4 font-medium hover:bg-surface-muted disabled:opacity-50";
const INPUT =
  "h-12 w-full min-w-0 rounded-control border border-line bg-surface px-3 text-lg tabular-nums aria-invalid:border-risk";

function NumberField({ field, value, error, onChange }: { field: Field; value: string; error?: string; onChange: (e: ChangeEvent<HTMLInputElement>) => void }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {field.label}
        {field.unit && <span className="font-normal text-ink-muted">, {field.unit}</span>}
      </label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        step={field.step}
        min={field.min}
        max={field.max}
        value={value}
        onChange={onChange}
        aria-invalid={!!error}
        aria-describedby={`${id}-hint`}
        className={`${INPUT} mt-1`}
      />
      <p id={`${id}-hint`} className={`mt-1 text-sm ${error ? "text-risk" : "text-ink-muted"}`}>
        {error ?? field.help}
      </p>
    </div>
  );
}

function TextField({ label, value, error, onChange }: { label: string; value: string; error?: string; onChange: (e: ChangeEvent<HTMLInputElement>) => void }) {
  const id = useId();
  return (
    <div className="max-w-sm">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input id={id} value={value} onChange={onChange} aria-invalid={!!error} className={`${INPUT} mt-1`} />
      {error && <p className="mt-1 text-sm text-risk">{error}</p>}
    </div>
  );
}
