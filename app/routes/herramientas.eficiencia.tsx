import { lazy, Suspense } from "react";
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
import { getToolNotes } from "~/lib/content.server";
import { skipRevalidationOnSearchChange, useUrlState } from "~/hooks/useUrlState";
import { site } from "~/site";
import { TOOLS } from "@src/calc/catalog";
import { calcularEficiencia, type EficienciaResult } from "@src/calc/eficiencia";
import { checkField, type FieldSpec } from "@src/calc/fields";
import { formatNumber } from "@src/calc/number";
import type { Route } from "./+types/herramientas.eficiencia";

const TOOL = TOOLS.find((t) => t.id === "ahorro-eficiencia")!;
const EficienciaChart = lazy(() => import("~/components/calc/ToolCharts").then((m) => ({ default: m.EficienciaChart })));

export async function loader() {
  return { notes: getToolNotes(TOOL.id) };
}
export const shouldRevalidate = skipRevalidationOnSearchChange;
export function meta() {
  return [{ title: `${TOOL.title} · ${site.name}` }, { name: "description", content: TOOL.summary }];
}

const F = {
  actual: {
    id: "actual",
    label: "Potencia del equipo actual",
    unit: "W",
    min: 1,
    max: 100_000,
    subject: "La potencia del equipo actual",
    example: "60",
    hint: "Figura en la etiqueta del equipo, en el manual o en la lámpara.",
  },
  nuevo: {
    id: "nuevo",
    label: "Potencia del equipo nuevo",
    unit: "W",
    min: 1,
    max: 100_000,
    subject: "La potencia del equipo nuevo",
    example: "9",
  },
  cantidad: {
    id: "cantidad",
    label: "Cantidad de equipos",
    unit: "equipos",
    min: 1,
    max: 10_000,
    subject: "La cantidad",
    example: "10",
  },
  horas: {
    id: "horas",
    label: "Horas de uso por día",
    unit: "h/día",
    min: 0.5,
    max: 24,
    step: 0.5,
    decimals: 1,
    slider: true,
    subject: "Las horas de uso",
    plural: true,
    example: "5",
  },
  precio: {
    id: "precio",
    label: "Precio de la energía",
    unit: "$/kWh",
    min: 0.01,
    max: 1_000_000,
    decimals: 2,
    subject: "El precio",
    example: "150",
    hint: "Es el cargo variable de tu factura, sin el cargo fijo. Si tu tarifa tiene escalones, usá el precio del último escalón que alcanzás.",
  },
  dias: {
    id: "dias",
    label: "Días de uso por mes",
    unit: "días",
    min: 1,
    max: 31,
    subject: "Los días de uso",
    plural: true,
    example: "22",
    hint: "Usamos 30: todos los días. Cambialo si no se usan a diario (por ejemplo, 22 en una oficina).",
  },
  factor: {
    id: "factor",
    label: "Factor de uso",
    unit: "%",
    min: 5,
    max: 100,
    step: 5,
    slider: true,
    subject: "El factor de uso",
    example: "50",
    hint: "Usamos 100 %: el equipo encendido a plena potencia todas esas horas. Heladeras, aires y todo lo que tiene termostato se apaga por ratos: con 100 % se sobreestima su consumo.",
  },
  inversion: {
    id: "inversion",
    label: "Costo de los equipos nuevos",
    unit: "$",
    min: 1,
    max: 1e12,
    subject: "El costo",
    example: "50000",
    hint: "Total, con instalación. Sirve para calcular en cuánto tiempo se recupera.",
  },
} satisfies Record<string, FieldSpec>;

const DEFAULTS = { actual: "", nuevo: "", cantidad: "1", horas: "", precio: "", dias: "30", factor: "100", inversion: "" };

export default function EficienciaPage({ loaderData }: Route.ComponentProps) {
  const { notes } = loaderData;
  const { values: v, set, reset } = useUrlState(DEFAULTS);

  const c = {
    actual: checkField(F.actual, v.actual, true),
    nuevo: checkField(F.nuevo, v.nuevo, true),
    cantidad: checkField(F.cantidad, v.cantidad, true),
    horas: checkField(F.horas, v.horas, true),
    precio: checkField(F.precio, v.precio, true),
    dias: checkField(F.dias, v.dias, true),
    factor: checkField(F.factor, v.factor, true),
    inversion: checkField(F.inversion, v.inversion, false),
  };
  const missing = (Object.keys(c) as (keyof typeof c)[])
    .filter((k) => k !== "inversion" && c[k].value == null)
    .map((k) => F[k].label);
  const hasErrors = Object.values(c).some((x) => x.error != null);

  let r: EficienciaResult | null = null;
  if (missing.length === 0 && !c.inversion.error) {
    r = calcularEficiencia({
      potenciaActualW: c.actual.value!,
      potenciaNuevaW: c.nuevo.value!,
      cantidad: c.cantidad.value!,
      horasDia: c.horas.value!,
      diasMes: c.dias.value!,
      factorUso: c.factor.value! / 100,
      precioKwh: c.precio.value!,
      inversion: c.inversion.value,
    });
  }
  const field = (k: keyof typeof F, required = true, help?: React.ReactNode) => (
    <NumberField spec={F[k]} value={v[k]} onChange={(x) => set(k, x)} required={required} help={help} />
  );

  const form = (
    <FormCard onReset={reset}>
      {field("actual")}
      {field("nuevo")}
      {field("cantidad")}
      {field("horas")}
      {field("precio")}
      <AdvancedOptions>
        {field("dias")}
        {field("factor")}
        {field("inversion", false)}
      </AdvancedOptions>
    </FormCard>
  );

  const ahorra = r != null && r.ahorroKwhMes > 0;
  const result = (
    <>
      <ResultCard missing={missing} hasErrors={hasErrors}>
        {r &&
          (ahorra ? (
            <div className="mt-4">
              <Headline label="Ahorro por mes (estimado)" value={`$ ${formatNumber(r.ahorroPesosMes)}`} unit="" />
              <p className="mt-3 text-lg">
                Ahorrás <strong>{formatNumber(r.ahorroKwhMes, 1)} kWh por mes</strong>, un{" "}
                <strong>{formatNumber(r.ahorroRelativo * 100)} %</strong> menos de lo que consumen hoy estos equipos.
              </p>
              <dl className="mt-6 grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
                <Stat label="Ahorro por año" value={`$ ${formatNumber(r.ahorroPesosAnio)}`} />
                <Stat label="Energía ahorrada por año" value={`${formatNumber(r.ahorroKwhAnio)} kWh`} />
                <Stat label="Consumo actual" value={`${formatNumber(r.consumoActualKwhMes, 1)} kWh/mes`} />
                <Stat label="Consumo con los equipos nuevos" value={`${formatNumber(r.consumoNuevoKwhMes, 1)} kWh/mes`} />
                {r.repagoMeses != null && (
                  <Stat
                    label="Se recupera la inversión en"
                    value={r.repagoMeses < 1 ? "menos de 1 mes" : `${formatNumber(r.repagoMeses, 1)} meses`}
                  />
                )}
              </dl>
            </div>
          ) : (
            <p className="mt-3 text-lg">
              El equipo nuevo consume <strong>igual o más</strong> que el actual: con estos datos, el cambio no ahorra
              energía. Revisá las potencias.
            </p>
          ))}
      </ResultCard>

      {r && ahorra && (
        <ChartCard>
          <Suspense fallback={<p className="flex h-[22rem] items-center justify-center text-base text-muted">Cargando el gráfico…</p>}>
            <EficienciaChart
              actualKwh={r.consumoActualKwhMes}
              nuevoKwh={r.consumoNuevoKwhMes}
              acumulado={r.repagoMeses != null ? r.acumulado : null}
              inversion={c.inversion.value}
            />
          </Suspense>
        </ChartCard>
      )}

      <Assumptions
        tool={TOOL}
        formula="ahorro [kWh/mes] = (W actual − W nuevo) × cantidad × h/día × días × factor ÷ 1000"
        notes={notes}
      >
        <li>
          <strong>Es una estimación.</strong> Todos los valores son datos tuyos: potencias, horas y precio.
        </li>
        <li>
          <strong>Precio variable:</strong> el ahorro se valora con el precio por kWh. El cargo fijo de la factura no
          cambia. Si al consumir menos bajás de escalón o de categoría, el ahorro real puede ser mayor.
        </li>
        {c.factor.value != null && (
          <li>
            <strong>Factor de uso:</strong> {formatNumber(c.factor.value)} %.
            {c.factor.value === 100 && " Supone que el equipo funciona a plena potencia todas las horas indicadas."}
          </li>
        )}
        <li>El repago es simple: no considera intereses ni cambios futuros en el precio de la energía.</li>
        <li>
          Conceptos: <NoteLink notes={notes} title="Potencia y energía" label="por qué los kW no son kWh" inline />.
        </li>
      </Assumptions>
    </>
  );

  return <ToolShell tool={TOOL} form={form} result={result} />;
}
