import { lazy, Suspense } from "react";
import { Link } from "react-router";
import { NumberField } from "~/components/calc/NumberField";
import {
  AdvancedOptions,
  Assumptions,
  ChartCard,
  FormCard,
  Headline,
  NoteLink,
  ResultCard,
  Stat,
  ToolShell,
} from "~/components/calc/ToolPage";
import { ArrowRight } from "~/components/icons";
import { formatDate } from "~/lib/format";
import { getToolNotes } from "~/lib/content.server";
import { skipRevalidationOnSearchChange, useUrlState } from "~/hooks/useUrlState";
import { site } from "~/site";
import { TOOLS } from "@src/calc/catalog";
import { checkField, type FieldSpec } from "@src/calc/fields";
import { formatNumber } from "@src/calc/number";
import { dimensionarSolar, MESES, type SolarResult } from "@src/calc/solar";
import { PARAMETROS, paramAsText, paramSource } from "@src/data/parametros";
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
  return [{ title: `${TOOL.title} · ${site.name}` }, { name: "description", content: TOOL.summary }];
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

const HSP_MES: FieldSpec = { ...F.hsp, id: "hsp-mes", slider: false, label: "HSP" };
const MONTH_KEYS = ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "m10", "m11", "m12"] as const;

const PR_PARAM = PARAMETROS.performanceRatio;
/** Sin valor de referencia cargado, el PR es un dato imprescindible y va con los datos principales. */
const PR_IS_ESSENTIAL = PR_PARAM.valor == null;

const DEFAULTS = {
  consumo: "",
  hsp: "",
  cobertura: "100",
  pr: paramAsText(PR_PARAM, 2),
  panel: paramAsText(PARAMETROS.potenciaPanelWp, 0),
  ...Object.fromEntries(MONTH_KEYS.map((k) => [k, ""])),
} as Record<"consumo" | "hsp" | "cobertura" | "pr" | "panel" | (typeof MONTH_KEYS)[number], string>;

// ------------------------------------------------------------------ página

export default function SolarPage({ loaderData }: Route.ComponentProps) {
  const { notes } = loaderData;
  const { values: v, set, reset } = useUrlState(DEFAULTS);

  const monthRaw = MONTH_KEYS.map((k) => v[k]);
  const monthsFilled = monthRaw.filter((r) => r.trim() !== "").length;
  const monthChecks = monthRaw.map((r) => checkField(HSP_MES, r, false));
  const monthsValid = monthsFilled === 12 && monthChecks.every((c) => c.value != null);
  const monthsError =
    monthsFilled > 0 && monthsFilled < 12
      ? `Completá los 12 meses o dejalos todos vacíos (cargaste ${monthsFilled}).`
      : (monthChecks.find((c) => c.error)?.error ?? null);

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
  if (
    consumo.value != null &&
    cobertura.value != null &&
    pr.value != null &&
    (hsp.value != null || monthsValid) &&
    !panel.error &&
    !monthsError
  ) {
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
          : `Usamos ${paramAsText(PR_PARAM, 2)} (${PR_PARAM.fuente}${PR_PARAM.estimado ? ", estimado" : ""}). Cambialo si conocés el de tu instalación.`,
      }}
      value={v.pr}
      onChange={(x) => set("pr", x)}
      required
      help={<NoteLink notes={notes} title="Performance ratio" label="Qué es el performance ratio" />}
    />
  );

  const form = (
    <FormCard onReset={reset}>
      <NumberField spec={F.consumo} value={v.consumo} onChange={(x) => set("consumo", x)} required />
      <NumberField
        spec={F.hsp}
        value={v.hsp}
        onChange={(x) => set("hsp", x)}
        required={!monthsValid}
        help={<NoteLink notes={notes} title="Horas sol pico" label="Qué son las horas sol pico" />}
      />
      <NumberField spec={F.cobertura} value={v.cobertura} onChange={(x) => set("cobertura", x)} required />
      {PR_IS_ESSENTIAL && prField}

      <AdvancedOptions>
        {!PR_IS_ESSENTIAL && prField}
        <NumberField spec={F.panel} value={v.panel} onChange={(x) => set("panel", x)} />
        <fieldset aria-describedby="hsp-mes-hint">
          <legend className="font-semibold">
            Horas sol pico de cada mes <span className="text-sm font-normal text-muted">(opcional, en h/día)</span>
          </legend>
          <p id="hsp-mes-hint" className="mt-2 text-base text-muted">
            Si las cargás, el gráfico muestra la diferencia entre verano e invierno y se usan en lugar del promedio anual.
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
      </AdvancedOptions>
    </FormCard>
  );

  const resultView = (
    <>
      <ResultCard missing={missing} hasErrors={hasErrors}>
        {result && <SolarResultView result={result} panelWp={panel.value} />}
      </ResultCard>

      {result && (
        <ChartCard>
          <Suspense
            fallback={<p className="flex h-[22rem] items-center justify-center text-base text-muted">Cargando el gráfico…</p>}
          >
            <SolarMonthlyChart meses={result.meses} />
          </Suspense>
        </ChartCard>
      )}

      <Assumptions tool={TOOL} formula="kWp = consumo anual × % a cubrir ÷ (HSP × 365 × PR)" notes={notes}>
        <li>
          <strong>Es una estimación.</strong> Para una instalación real hace falta un relevamiento técnico del lugar.
        </li>
        <li>
          <strong>Balance anual:</strong> lo que sobra en verano compensa lo que falta en invierno. En la práctica, el
          excedente se inyecta a la red y se valora según el esquema de{" "}
          <NoteLink notes={notes} title="Generación distribuida" label="generación distribuida" inline /> vigente, que
          puede ser distinto de lo que pagás por la energía.
        </li>
        {result && (
          <li>
            <strong>Horas sol pico:</strong> {formatNumber(result.hspPromedio, 2)} h/día
            {monthsValid ? " (promedio de tus 12 valores mensuales)" : ""}, dato tuyo.
            {!monthsValid && " Sin valores mensuales, el gráfico solo varía por los días de cada mes: no muestra las estaciones."}
          </li>
        )}
        {pr.value != null && (
          <li>
            <strong>Performance ratio:</strong> {formatNumber(pr.value, 2)}, {paramSource(PR_PARAM, pr.value, formatDate)}.
          </li>
        )}
        <li>No incluye la pérdida de rendimiento de los paneles con los años, ni sombras que el PR no contemple.</li>
        <li>El consumo mensual se reparte según los días de cada mes.</li>
      </Assumptions>
    </>
  );

  return <ToolShell tool={TOOL} form={form} result={resultView} />;
}

function SolarResultView({ result: r, panelWp }: { result: SolarResult; panelWp: number | null }) {
  const pct = Math.round(r.coberturaResultante * 100);
  const roiParams = new URLSearchParams({ gen: String(Math.round(r.generacionAnualKwh)) });
  return (
    <div className="mt-4">
      <Headline label="Potencia a instalar (estimada)" value={formatNumber(r.kwpNecesario, 2)} unit="kWp" />

      {r.paneles && panelWp != null && (
        <p className="mt-3 text-lg">
          Equivale a <strong>{r.paneles.cantidad} paneles</strong> de {formatNumber(panelWp)} Wp ={" "}
          <strong>{formatNumber(r.paneles.kwpInstalado, 2)} kWp</strong> instalados.
          {pct > 100 && (
            <span className="block text-base text-muted">Con paneles enteros se cubre el {pct} % del consumo anual.</span>
          )}
        </p>
      )}

      <dl className="mt-6 grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
        <Stat label="Generación estimada por año" value={`${formatNumber(r.generacionAnualKwh)} kWh`} />
        <Stat label="Promedio por mes" value={`${formatNumber(r.generacionAnualKwh / 12)} kWh`} />
        <Stat label="Tu consumo por año" value={`${formatNumber(r.consumoAnualKwh)} kWh`} />
        <Stat label="Rendimiento del sistema" value={`${formatNumber(r.rendimientoEspecifico)} kWh por kWp al año`} />
      </dl>

      <p className="mt-6 border-t border-border pt-5">
        <Link
          to={`/herramientas/retorno-solar?${roiParams}`}
          viewTransition
          className="group inline-flex min-h-11 items-center gap-2 font-semibold"
        >
          Calcular el retorno de esta instalación
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
        </Link>
      </p>
    </div>
  );
}
