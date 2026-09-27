import { lazy, Suspense, useRef, useState } from "react";
import { Link } from "react-router";
import { ConfirmDialog } from "~/components/calc/ConfirmDialog";
import { NumberField } from "~/components/calc/NumberField";
import { formatDate } from "~/lib/format";
import { getToolNotes } from "~/lib/content.server";
import { skipRevalidationOnSearchChange, useUrlState } from "~/hooks/useUrlState";
import { site } from "~/site";
import { TOOLS } from "@src/calc/catalog";
import { checkField, type FieldSpec } from "@src/calc/fields";
import { formatNumber } from "@src/calc/number";
import { dimensionarSolar, MESES, type SolarResult } from "@src/calc/solar";
import { PARAMETROS, type Parametro } from "@src/data/parametros";
import type { Route } from "./+types/herramientas.solar";

const TOOL = TOOLS.find((t) => t.id === "dimensionamiento-solar")!;

// Recharts pesa ~120 KB: se descarga recién cuando hay un resultado para graficar.
const SolarMonthlyChart = lazy(() =>
  import("~/components/calc/SolarMonthlyChart").then((m) => ({ default: m.SolarMonthlyChart })),
);

export async function loader() {
  return { notes: getToolNotes(TOOL.id) };
}

export const shouldRevalidate = skipRevalidationOnSearchChange;

export function meta() {
  return [
    { title: `${TOOL.title} · ${site.name}` },
    { name: "description", content: TOOL.summary },
  ];
}

// ------------------------------------------------------------------ campos

const F = {
  consumo: {
    id: "consumo",
    label: "Consumo eléctrico mensual",
    unit: "kWh/mes",
    min: 10,
    max: 200_000,
    subject: "El consumo",
    example: "350",
    hint: "Figura en tu factura de luz. Si cambia mucho entre meses, usá el promedio de un año.",
  },
  hsp: {
    id: "hsp",
    label: "Horas sol pico de tu zona",
    unit: "h/día",
    min: 0.5,
    max: 9,
    step: 0.1,
    decimals: 1,
    slider: true,
    subject: "Las horas sol pico",
    plural: true,
    example: "4,5",
    hint: "Promedio anual para tu ubicación. Varían mucho según el lugar: buscalas en una base de datos de irradiación solar.",
  },
  cobertura: {
    id: "cobertura",
    label: "Parte del consumo a cubrir",
    unit: "%",
    min: 10,
    max: 100,
    step: 5,
    slider: true,
    subject: "La parte a cubrir",
    example: "80",
    hint: "Usamos 100 %: generar en el año lo mismo que consumís. Bajalo si querés cubrir solo una parte.",
  },
  pr: {
    id: "pr",
    label: "Performance ratio",
    unit: "0 a 1",
    min: 0.5,
    max: 0.95,
    step: 0.01,
    decimals: 2,
    slider: true,
    subject: "El performance ratio",
    example: "0,8",
  },
  panel: {
    id: "panel",
    label: "Potencia de cada panel",
    unit: "Wp",
    min: 50,
    max: 1000,
    subject: "La potencia del panel",
    example: "500",
    hint: "Figura en la hoja de datos del panel. Sirve para estimar cuántos paneles hacen falta.",
  },
} satisfies Record<string, FieldSpec>;

const HSP_MES: FieldSpec = { ...F.hsp, id: "hsp-mes", slider: false, label: "HSP", subject: "Las horas sol pico" };
const MONTH_KEYS = ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "m10", "m11", "m12"] as const;

/** Valor de un parámetro del sector como texto para el campo ("0,8"), o "" si falta. */
function paramDefault(p: Parametro, decimals: number): string {
  return p.valor == null ? "" : formatNumber(p.valor, decimals).replace(/\./g, "");
}

const PR_PARAM = PARAMETROS.performanceRatio;
const PANEL_PARAM = PARAMETROS.potenciaPanelWp;
/** Sin valor de referencia cargado, el PR es un dato imprescindible y va con los datos principales. */
const PR_IS_ESSENTIAL = PR_PARAM.valor == null;

const DEFAULTS = {
  consumo: "",
  hsp: "",
  cobertura: "100",
  pr: paramDefault(PR_PARAM, 2),
  panel: paramDefault(PANEL_PARAM, 0),
  ...Object.fromEntries(MONTH_KEYS.map((k) => [k, ""])),
} as Record<"consumo" | "hsp" | "cobertura" | "pr" | "panel" | (typeof MONTH_KEYS)[number], string>;

// ------------------------------------------------------------------ página

const i = (n: number) => ({ "--i": n }) as React.CSSProperties;

export default function SolarPage({ loaderData }: Route.ComponentProps) {
  const { notes } = loaderData;
  const { values: v, set, reset } = useUrlState(DEFAULTS);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const hspRef = useRef<HTMLInputElement>(null);

  // Validación
  const monthRaw = MONTH_KEYS.map((k) => v[k]);
  const monthsFilled = monthRaw.filter((r) => r.trim() !== "").length;
  const monthChecks = monthRaw.map((r) => checkField(HSP_MES, r, false));
  const monthsValid = monthsFilled === 12 && monthChecks.every((c) => c.value != null);
  const monthsError =
    monthsFilled > 0 && monthsFilled < 12
      ? `Completá los 12 meses o dejalos todos vacíos (cargaste ${monthsFilled}).`
      : monthChecks.find((c) => c.error)?.error ?? null;

  const consumo = checkField(F.consumo, v.consumo, true);
  const hsp = checkField(F.hsp, v.hsp, !monthsValid);
  const cobertura = checkField(F.cobertura, v.cobertura, true);
  const pr = checkField(F.pr, v.pr, true);
  const panel = checkField(F.panel, v.panel, false);

  const missing: string[] = [];
  if (consumo.value == null) missing.push(F.consumo.label);
  if (hsp.value == null && !monthsValid) missing.push(F.hsp.label);
  if (cobertura.value == null) missing.push(F.cobertura.label);
  if (pr.value == null) missing.push(F.pr.label);
  const hasErrors = [consumo, hsp, cobertura, pr, panel].some((c) => c.error != null) || monthsError != null;

  let result: SolarResult | null = null;
  if (consumo.value != null && cobertura.value != null && pr.value != null && (hsp.value != null || monthsValid) && !panel.error && !monthsError) {
    result = dimensionarSolar({
      consumoMensualKwh: consumo.value,
      hspDiaria: hsp.value ?? 1,
      cobertura: cobertura.value / 100,
      performanceRatio: pr.value,
      potenciaPanelWp: panel.value,
      hspMensual: monthsValid ? monthChecks.map((c) => c.value!) : null,
    });
  }

  const prField = (
    <NumberField
      spec={{
        ...F.pr,
        hint: PR_IS_ESSENTIAL
          ? "Resume las pérdidas del sistema (temperatura, cableado, inversor, suciedad). Todavía no hay un valor de referencia cargado en el sitio: usá el de tu proyecto o el que te indique tu instalador."
          : `Usamos ${paramDefault(PR_PARAM, 2)} (${PR_PARAM.fuente}${PR_PARAM.estimado ? ", estimado" : ""}). Cambialo si conocés el de tu instalación.`,
      }}
      value={v.pr}
      onChange={(x) => set("pr", x)}
      required
      help={<NoteLink notes={notes} title="Performance ratio" label="Qué es el performance ratio" />}
    />
  );

  return (
    <div className="relative">
      <div className="grid-bg pointer-events-none absolute inset-x-0 top-0 h-72" aria-hidden="true" />
      <div className="relative mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <p className="reveal text-base" style={i(0)}>
          <Link to="/herramientas" viewTransition className="inline-flex min-h-11 items-center">
            Herramientas
          </Link>
        </p>
        <h1 className="reveal mt-2 text-4xl font-bold sm:text-5xl" style={i(1)}>
          {TOOL.title}
        </h1>
        <p className="reveal mt-4 max-w-2xl text-lg text-muted" style={i(2)}>
          {TOOL.summary}
        </p>

        <div className="reveal mt-10 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]" style={i(3)}>
          {/* ------------------------------------------------------ formulario */}
          <form
            className="flex flex-col gap-7 rounded-2xl border border-border bg-surface p-5 sm:p-7"
            onSubmit={(e) => e.preventDefault()}
            noValidate
            aria-labelledby="datos-title"
          >
            <h2 id="datos-title" className="text-xl font-bold">
              Tus datos
            </h2>
            <NumberField spec={F.consumo} value={v.consumo} onChange={(x) => set("consumo", x)} required />
            <NumberField
              spec={F.hsp}
              value={v.hsp}
              onChange={(x) => set("hsp", x)}
              required={!monthsValid}
              inputRef={hspRef}
              help={<NoteLink notes={notes} title="Horas sol pico" label="Qué son las horas sol pico" />}
            />
            <NumberField spec={F.cobertura} value={v.cobertura} onChange={(x) => set("cobertura", x)} required />
            {PR_IS_ESSENTIAL && prField}

            <details
              open={advancedOpen}
              onToggle={(e) => setAdvancedOpen(e.currentTarget.open)}
              className="rounded-xl border border-border bg-bg"
            >
              <summary className="flex min-h-12 cursor-pointer items-center justify-between px-4 font-semibold">
                Opciones avanzadas
                <span className="text-sm font-medium text-link underline underline-offset-4">
                  {advancedOpen ? "Ocultar" : "Mostrar"}
                </span>
              </summary>
              <div className="flex flex-col gap-7 border-t border-border p-4">
                {!PR_IS_ESSENTIAL && prField}
                <NumberField spec={F.panel} value={v.panel} onChange={(x) => set("panel", x)} />

                <fieldset aria-describedby="hsp-mes-hint">
                  <legend className="font-semibold">
                    Horas sol pico de cada mes <span className="text-sm font-normal text-muted">(opcional, en h/día)</span>
                  </legend>
                  <p id="hsp-mes-hint" className="mt-2 text-base text-muted">
                    Si las cargás, el gráfico muestra la diferencia entre verano e invierno y se usan en lugar del
                    promedio anual.
                  </p>
                  <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
                    {MESES.map((mes, idx) => {
                      const key = MONTH_KEYS[idx]!;
                      const bad = monthChecks[idx]!.error != null;
                      return (
                        <label key={key} className="flex flex-col gap-1 text-sm font-medium">
                          {mes}
                          <input
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            value={v[key]}
                            onChange={(e) => set(key, e.target.value)}
                            aria-invalid={bad || undefined}
                            aria-describedby="hsp-mes-error"
                            className={`min-h-11 w-full rounded-lg border bg-surface px-3 text-base tabular-nums text-ink outline-none focus:border-link ${
                              bad ? "border-[var(--c-danger)]" : "border-border"
                            }`}
                          />
                        </label>
                      );
                    })}
                  </div>
                  <p id="hsp-mes-error" aria-live="polite" className="mt-2 text-base font-medium text-[var(--c-danger)] empty:hidden">
                    {monthsError ?? ""}
                  </p>
                </fieldset>
              </div>
            </details>

            <div className="border-t border-border pt-5">
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="min-h-11 rounded-full px-1 font-medium text-muted underline underline-offset-4 hover:text-ink"
              >
                Borrar los datos cargados
              </button>
              <p className="mt-1 text-sm text-muted">
                Tus datos quedan guardados en la dirección de esta página: podés recargarla o compartir el link.
              </p>
            </div>
          </form>

          {/* ------------------------------------------------------ resultado */}
          <section aria-labelledby="resultado-title" aria-live="polite" className="flex flex-col gap-6 lg:sticky lg:top-24">
            <div className="rounded-2xl border border-border bg-surface p-5 sm:p-7">
              <h2 id="resultado-title" className="text-xl font-bold">
                Resultado
              </h2>
              {result ? (
                <SolarResultView result={result} panelWp={panel.value} />
              ) : (
                <div className="mt-3 text-base">
                  {missing.length > 0 ? (
                    <>
                      <p className="text-muted">Para calcular, completá:</p>
                      <ul className="mt-2 list-disc space-y-1 pl-5">
                        {missing.map((m) => (
                          <li key={m}>{m}</li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    hasErrors && <p className="text-muted">Corregí los datos marcados en rojo para ver el resultado.</p>
                  )}
                </div>
              )}
            </div>

            {result && (
              <div className="rounded-2xl border border-border bg-surface p-5 sm:p-7">
                <Suspense
                  fallback={
                    <p className="flex h-[22rem] items-center justify-center text-base text-muted">Cargando el gráfico…</p>
                  }
                >
                  <SolarMonthlyChart meses={result.meses} />
                </Suspense>
              </div>
            )}

            <Assumptions
              result={result}
              monthsUsed={monthsValid}
              prValue={pr.value}
              notes={notes}
            />
          </section>
        </div>
      </div>

      <ConfirmDialog
        open={confirmReset}
        title="¿Borrar los datos cargados?"
        description="Se vacían todos los campos de esta calculadora. No se puede deshacer."
        confirmLabel="Borrar datos"
        cancelLabel="Mantener datos"
        onConfirm={() => {
          reset();
          setConfirmReset(false);
          hspRef.current?.closest("form")?.querySelector<HTMLInputElement>("input[type=text]")?.focus();
        }}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}

// ------------------------------------------------------------------ piezas

function SolarResultView({ result: r, panelWp }: { result: SolarResult; panelWp: number | null }) {
  const pct = Math.round(r.coberturaResultante * 100);
  return (
    <div className="mt-4">
      <p className="text-sm font-semibold uppercase tracking-widest text-amber-text">Potencia a instalar (estimada)</p>
      <p className="mt-1 text-5xl font-bold tabular-nums">
        {formatNumber(r.kwpNecesario, 2)} <span className="text-2xl font-semibold text-muted">kWp</span>
      </p>

      {r.paneles && panelWp != null && (
        <p className="mt-3 text-lg">
          Equivale a <strong>{r.paneles.cantidad} paneles</strong> de {formatNumber(panelWp)} Wp ={" "}
          <strong>{formatNumber(r.paneles.kwpInstalado, 2)} kWp</strong> instalados.
          {pct > 100 && (
            <span className="block text-base text-muted">
              Con paneles enteros se cubre el {pct} % del consumo anual.
            </span>
          )}
        </p>
      )}

      <dl className="mt-6 grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
        <Stat label="Generación estimada por año" value={`${formatNumber(r.generacionAnualKwh)} kWh`} />
        <Stat label="Promedio por mes" value={`${formatNumber(r.generacionAnualKwh / 12)} kWh`} />
        <Stat label="Tu consumo por año" value={`${formatNumber(r.consumoAnualKwh)} kWh`} />
        <Stat label="Rendimiento del sistema" value={`${formatNumber(r.rendimientoEspecifico)} kWh por kWp al año`} />
      </dl>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function Assumptions({
  result,
  monthsUsed,
  prValue,
  notes,
}: {
  result: SolarResult | null;
  monthsUsed: boolean;
  prValue: number | null;
  notes: { title: string; slug: string }[];
}) {
  const prSource =
    PR_PARAM.valor != null && prValue === PR_PARAM.valor
      ? `${PR_PARAM.fuente}${PR_PARAM.fecha ? `, ${formatDate(PR_PARAM.fecha)}` : ""}${PR_PARAM.estimado ? " (estimado)" : ""}`
      : "dato tuyo";

  return (
    <div className="rounded-2xl border border-border bg-surface-2/60 p-5 sm:p-7">
      <h2 className="text-lg font-bold">Supuestos y fórmula</h2>
      <p className="mt-3 rounded-xl bg-surface px-4 py-3 font-mono text-base">
        kWp = consumo anual × % a cubrir ÷ (HSP × 365 × PR)
      </p>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-base">
        <li>
          <strong>Es una estimación.</strong> Para una instalación real hace falta un relevamiento técnico del lugar.
        </li>
        <li>
          <strong>Balance anual:</strong> lo que sobra en verano compensa lo que falta en invierno. En la práctica,
          el excedente se inyecta a la red y se valora según el esquema de{" "}
          <NoteLink notes={notes} title="Generación distribuida" label="generación distribuida" inline /> vigente, que puede
          ser distinto de lo que pagás por la energía.
        </li>
        {result && (
          <li>
            <strong>Horas sol pico:</strong> {formatNumber(result.hspPromedio, 2)} h/día
            {monthsUsed ? " (promedio de tus 12 valores mensuales)" : ""}, dato tuyo.
            {!monthsUsed && " Sin valores mensuales, el gráfico solo varía por los días de cada mes: no muestra las estaciones."}
          </li>
        )}
        {prValue != null && (
          <li>
            <strong>Performance ratio:</strong> {formatNumber(prValue, 2)}, {prSource}.
          </li>
        )}
        <li>No incluye la pérdida de rendimiento de los paneles con los años, ni sombras que el PR no contemple.</li>
        <li>El consumo mensual se reparte según los días de cada mes.</li>
      </ul>

      {notes.length > 0 && (
        <>
          <h3 className="mt-6 font-bold">Conceptos que usa este cálculo</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {notes.map((n) => (
              <li key={n.slug}>
                <Link
                  to={`/notas/${n.slug}`}
                  viewTransition
                  className="inline-flex min-h-11 items-center rounded-full border border-border bg-surface px-3.5 text-base"
                >
                  {n.title}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-6 text-sm text-muted">
        Modelo de cálculo revisado el <time dateTime={TOOL.revisado}>{formatDate(TOOL.revisado)}</time>.
      </p>
    </div>
  );
}

/**
 * Link a una nota del vault si está publicada. Si no lo está: dentro de una
 * frase queda el texto sin link (inline); como ayuda suelta, no se muestra.
 */
function NoteLink({
  notes,
  title,
  label,
  inline = false,
}: {
  notes: { title: string; slug: string }[];
  title: string;
  label: string;
  inline?: boolean;
}) {
  const note = notes.find((n) => n.title === title);
  if (!note) return inline ? <>{label}</> : null;
  return (
    <Link to={`/notas/${note.slug}`} viewTransition>
      {label}
    </Link>
  );
}
