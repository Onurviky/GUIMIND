import { useId, useState } from "react";
import { checkField, type FieldSpec } from "@src/calc/fields";
import { formatNumber, parseDecimal } from "@src/calc/number";

interface Props {
  spec: FieldSpec;
  value: string;
  onChange: (raw: string) => void;
  required?: boolean;
  /** Contenido extra de ayuda (por ejemplo, un link a una nota). */
  help?: React.ReactNode;
  inputRef?: React.Ref<HTMLInputElement>;
}

/**
 * Campo numérico con unidad visible y validación inline.
 * - Acepta coma o punto decimal.
 * - Si tiene slider, el slider y el número están sincronizados y son lineales.
 * - Un valor inválido se marca al momento; un obligatorio vacío, al salir del campo.
 */
export function NumberField({ spec, value, onChange, required = false, help, inputRef }: Props) {
  const id = useId();
  const [touched, setTouched] = useState(false);
  const check = checkField(spec, value, required);
  const showError = check.error && (value.trim() !== "" || touched);
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  const parsed = parseDecimal(value);
  const sliderValue = parsed == null ? spec.min : Math.min(spec.max, Math.max(spec.min, parsed));
  const decimals = spec.decimals ?? 0;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="font-semibold">
        {spec.label}
        {!required && <span className="ml-1.5 text-sm font-normal text-muted">(opcional)</span>}
        {/* La unidad se ve junto al campo; para lectores de pantalla va en el nombre. */}
        <span className="sr-only">, en {spec.unit}</span>
      </label>

      <div className="flex items-center gap-4">
        {spec.slider && (
          <input
            type="range"
            aria-label={`${spec.label} (control deslizante)`}
            min={spec.min}
            max={spec.max}
            step={spec.step ?? 1}
            value={sliderValue}
            onChange={(e) => onChange(formatNumber(Number(e.target.value), decimals).replace(/\./g, ""))}
            className="h-11 min-w-0 flex-1 accent-[var(--link)]"
          />
        )}
        <div
          className={`flex min-h-12 items-center overflow-hidden rounded-xl border bg-bg transition-colors focus-within:border-link ${
            showError ? "border-[var(--c-danger)]" : "border-border"
          } ${spec.slider ? "w-36 shrink-0" : "w-full"}`}
        >
          <input
            ref={inputRef}
            id={id}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={showError ? true : undefined}
            aria-describedby={`${spec.hint || help ? hintId : ""} ${showError ? errorId : ""}`.trim() || undefined}
            aria-required={required || undefined}
            className="min-h-12 w-full min-w-0 self-stretch bg-transparent px-3.5 text-lg tabular-nums text-ink outline-none"
          />
          <span className="shrink-0 border-l border-border bg-surface-2 px-3 py-3 text-sm text-muted" aria-hidden="true">
            {spec.unit}
          </span>
        </div>
      </div>

      {(spec.hint || help) && (
        <p id={hintId} className="text-base text-muted">
          {spec.hint} {help}
        </p>
      )}
      <p id={errorId} aria-live="polite" className="text-base font-medium text-[var(--c-danger)] empty:hidden">
        {showError ? check.error : ""}
      </p>
    </div>
  );
}
