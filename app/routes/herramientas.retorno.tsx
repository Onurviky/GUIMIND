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
import { formatDate } from "~/lib/format";
import { getToolNotes } from "~/lib/content.server";
import { skipRevalidationOnSearchChange, useUrlState } from "~/hooks/useUrlState";
import { site } from "~/site";
import { TOOLS } from "@src/calc/catalog";
import { checkField, type FieldSpec } from "@src/calc/fields";
import { formatNumber } from "@src/calc/number";
import { calcularRoi, type RoiResult } from "@src/calc/roi";
import { PARAMETROS, paramAsText, paramSource } from "@src/data/parametros";
import type { Route } from "./+types/herramientas.retorno";

const TOOL = TOOLS.find((t) => t.id === "retorno-solar")!;
const RoiChart = lazy(() => import("~/components/calc/ToolCharts").then((m) => ({ default: m.RoiChart })));

export async function loader() {
  return { notes: getToolNotes(TOOL.id) };
}
export const shouldRevalidate = skipRevalidationOnSearchChange;
export function meta() {
  return [{ title: `${TOOL.title} · ${site.name}` }, { name: "description", content: TOOL.summary }];
}

const TC = PARAMETROS.tipoCambio;
const DEG = PARAMETROS.degradacionAnual;

const F = {
  inversion: {
    id: "inversion",
    label: "Costo total de la instalación",
    unit: "USD",
    min: 1,
    max: 1e9,
    subject: "El costo",
    example: "6000",
    hint: "Paneles, inversor, estructura, instalación y trámites. En dólares.",
  },
  gen: {
    id: "gen",
    label: "Generación estimada por año",
    unit: "kWh/año",
    min: 1,
    max: 1e9,
    subject: "La generación",
    example: "5000",
    hint: "Si todavía no la tenés, calculala con el dimensionamiento solar.",
  },
  auto: {
    id: "auto",
    label: "Parte que consumís en el momento",
    unit: "%",
    min: 0,
    max: 100,
    step: 5,
    slider: true,
    subject: "El autoconsumo",
    example: "60",
    hint: "Qué parte de lo que generan los paneles usás mientras se genera (de día). El resto se inyecta a la red. Depende de tus horarios: es un dato tuyo o de tu instalador.",
  },
  compra: {
    id: "compra",
    label: "Precio de la energía que comprás",
    unit: "$/kWh",
    min: 0.01,
    max: 1e9,
    decimals: 2,
    subject: "El precio",
    example: "150",
    hint: "El cargo variable de tu factura, en pesos.",
  },
  inyeccion: {
    id: "inyeccion",
    label: "Valor de la energía que inyectás",
    unit: "$/kWh",
    min: 0,
    max: 1e9,
    decimals: 2,
    subject: "El valor de la inyección",
    example: "80",
    hint: "Lo que te reconocen por cada kWh que entregás a la red. Si no estás adherido a generación distribuida o no te lo pagan, poné 0.",
  },
  tc: {
    id: "tc",
    label: "Tipo de cambio",
    unit: "$/USD",
    min: 0.01,
    max: 1e9,
    decimals: 2,
    subject: "El tipo de cambio",
    example: "1000",
    hint:
      TC.valor == null
        ? "Pesos por dólar, para pasar los precios de la energía a dólares. Usá el del día en que pagás la instalación."
        : `Usamos ${paramAsText(TC, 2)} (${TC.fuente}, ${formatDate(TC.fecha!)}). Cambialo si querés usar otro.`,
  },
  deg: {
    id: "deg",
    label: "Pérdida de generación por año",
    unit: "%/año",
    min: 0,
    max: 5,
    step: 0.1,
    decimals: 2,
    subject: "La degradación",
    example: "0,5",
    hint:
      DEG.valor == null
        ? "La declara el fabricante en la garantía de rendimiento de los paneles. Si la dejás vacía, no se considera."
        : `Usamos ${paramAsText(DEG, 2)} % (${DEG.fuente}). Cambiala si conocés la de tus paneles.`,
  },
  mant: {
    id: "mant",
    label: "Mantenimiento por año",
    unit: "USD/año",
    min: 0,
    max: 1e8,
    subject: "El mantenimiento",
    example: "50",
    hint: "Usamos 0. Sumá limpieza, seguro o reemplazo del inversor si los tenés presupuestados.",
  },
  horizonte: {
    id: "horizonte",
    label: "Años a analizar",
    unit: "años",
    min: 1,
    max: 50,
    subject: "El horizonte",
    example: "20",
    hint: "Usamos 20 años como período para mostrar el resultado. No es la vida útil de los equipos.",
  },
  variacion: {
    id: "variacion",
    label: "Variación anual del precio de la energía, en dólares",
    unit: "%/año",
    min: -50,
    max: 50,
    decimals: 1,
    subject: "La variación",
    example: "2",
    hint: "Usamos 0: el precio en dólares se mantiene. Si creés que la energía va a subir más que el dólar, poné un valor positivo.",
  },
  tasa: {
    id: "tasa",
    label: "Tasa de descuento",
    unit: "%/año",
    min: 0,
    max: 100,
    decimals: 1,
    subject: "La tasa",
    example: "8",
    hint: "Lo que rendiría tu dinero en otra inversión en dólares. Si la cargás, calculamos el valor actual neto (VAN).",
  },
} satisfies Record<string, FieldSpec>;

const DEFAULTS = {
  inversion: "",
  gen: "",
  auto: "",
  compra: "",
  inyeccion: "",
  tc: paramAsText(TC, 2),
  deg: paramAsText(DEG, 2),
  mant: "0",
  horizonte: "20",
  variacion: "0",
  tasa: "",
};

type K = keyof typeof DEFAULTS;
const REQUIRED: K[] = ["inversion", "gen", "auto", "compra", "inyeccion", "tc", "mant", "horizonte", "variacion"];

export default function RetornoPage({ loaderData }: Route.ComponentProps) {
  const { notes } = loaderData;
  const { values: v, set, reset } = useUrlState(DEFAULTS);

  const c = Object.fromEntries(
    (Object.keys(F) as K[]).map((k) => [k, checkField(F[k], v[k], REQUIRED.includes(k))]),
  ) as Record<K, ReturnType<typeof checkField>>;
  const horizonteError =
    c.horizonte.value != null && !Number.isInteger(c.horizonte.value) ? "Los años a analizar tienen que ser un número entero." : null;

  const missing = REQUIRED.filter((k) => c[k].value == null).map((k) => F[k].label);
  const hasErrors = Object.values(c).some((x) => x.error != null) || horizonteError != null;

  let r: RoiResult | null = null;
  if (missing.length === 0 && !hasErrors) {
    r = calcularRoi({
      inversionUsd: c.inversion.value!,
      generacionAnualKwh: c.gen.value!,
      autoconsumo: c.auto.value! / 100,
      precioCompra: c.compra.value!,
      precioInyeccion: c.inyeccion.value!,
      tipoCambio: c.tc.value!,
      mantenimientoUsdAnio: c.mant.value!,
      degradacionAnual: (c.deg.value ?? 0) / 100,
      variacionPrecioAnual: c.variacion.value! / 100,
      horizonteAnios: c.horizonte.value!,
      tasaDescuento: c.tasa.value == null ? null : c.tasa.value / 100,
    });
  }

  const field = (k: K, help?: React.ReactNode) => (
    <NumberField spec={F[k]} value={v[k]} onChange={(x) => set(k, x)} required={REQUIRED.includes(k)} help={help} />
  );
  const tcEsencial = TC.valor == null;

  const form = (
    <FormCard onReset={reset}>
      {field("inversion")}
      {field(
        "gen",
        <Link to="/herramientas/dimensionamiento-solar" viewTransition>
          Ir al dimensionamiento solar
        </Link>,
      )}
      {field("auto")}
      {field("compra")}
      {field(
        "inyeccion",
        <NoteLink notes={notes} title="Generación distribuida" label="Qué es la generación distribuida" />,
      )}
      {tcEsencial && field("tc")}
      <AdvancedOptions>
        {!tcEsencial && field("tc")}
        {field("deg")}
        {field("mant")}
        <div>
          {field("horizonte")}
          <p aria-live="polite" className="mt-1 text-base font-medium text-[var(--c-danger)] empty:hidden">
            {horizonteError ?? ""}
          </p>
        </div>
        {field("variacion")}
        {field("tasa")}
      </AdvancedOptions>
    </FormCard>
  );

  const usd = (n: number, d = 0) => `USD ${formatNumber(n, d)}`;
  const result = (
    <>
      <ResultCard missing={missing} hasErrors={hasErrors}>
        {r && (
          <div className="mt-4">
            {r.repagoAnios != null ? (
              <Headline label="Se recupera la inversión en (estimado)" value={formatNumber(r.repagoAnios, 1)} unit="años" />
            ) : (
              <>
                <Headline label="Se recupera la inversión en (estimado)" value={`más de ${c.horizonte.value}`} unit="años" />
                <p className="mt-2 text-lg">
                  Con estos datos, el ahorro no alcanza a cubrir la inversión en {c.horizonte.value} años.
                </p>
              </>
            )}
            <dl className="mt-6 grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
              <Stat label="Ahorro el primer año" value={usd(r.ahorroAnio1Usd)} />
              <Stat label={`Resultado neto en ${c.horizonte.value} años`} value={usd(r.gananciaNetaUsd)} />
              <Stat label="Tasa interna de retorno (TIR)" value={r.tir == null ? "No se puede calcular" : `${formatNumber(r.tir * 100, 1)} % anual`} />
              {r.vanUsd != null && <Stat label={`Valor actual neto (al ${formatNumber(c.tasa.value!, 1)} %)`} value={usd(r.vanUsd)} />}
            </dl>
          </div>
        )}
      </ResultCard>

      {r && (
        <ChartCard>
          <Suspense fallback={<p className="flex h-[22rem] items-center justify-center text-base text-muted">Cargando el gráfico…</p>}>
            <RoiChart anios={r.anios} inversion={c.inversion.value!} />
          </Suspense>
        </ChartCard>
      )}

      <Assumptions
        tool={TOOL}
        formula="ahorro anual = generación × (autoconsumo × precio compra + resto × valor inyección) ÷ tipo de cambio − mantenimiento"
        notes={notes}
      >
        <li>
          <strong>En dólares:</strong> los precios en pesos se pasan a dólares con el tipo de cambio que cargaste
          {c.tc.value != null ? ` (${formatNumber(c.tc.value, 2)} $/USD, ${paramSource(TC, c.tc.value, formatDate)})` : ""}.
          Así el repago no depende de la inflación.
        </li>
        <li>
          <strong>Autoconsumo vs. inyección:</strong> lo que usás en el momento evita comprar energía; lo que inyectás
          vale lo que pague el esquema de{" "}
          <NoteLink notes={notes} title="Generación distribuida" label="generación distribuida" inline />, que puede ser
          menos (o nada).
        </li>
        <li>
          <strong>Degradación:</strong>{" "}
          {c.deg.value == null
            ? "no se considera (no la cargaste): el resultado es algo optimista."
            : `${formatNumber(c.deg.value, 2)} % por año, ${paramSource(DEG, c.deg.value, formatDate)}.`}
        </li>
        <li>
          <strong>Precio de la energía:</strong>{" "}
          {c.variacion.value === 0
            ? "se mantiene constante en dólares durante todo el período."
            : `varía ${formatNumber(c.variacion.value ?? 0, 1)} % por año en dólares.`}
        </li>
        <li>No incluye financiación, impuestos a la inversión, ni ahorros por bajar de escalón en la tarifa.</li>
        <li>
          <strong>Es una estimación.</strong> Sirve para comparar escenarios, no reemplaza un presupuesto.
        </li>
      </Assumptions>
    </>
  );

  return <ToolShell tool={TOOL} form={form} result={result} />;
}
