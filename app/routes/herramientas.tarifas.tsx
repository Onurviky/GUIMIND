import { lazy, Suspense, useId } from "react";
import { NumberField } from "~/components/calc/NumberField";
import {
  AdvancedOptions,
  Assumptions,
  ChartCard,
  FormCard,
  NoteLink,
  ResultCard,
  ToolShell,
} from "~/components/calc/ToolPage";
import { getToolNotes } from "~/lib/content.server";
import { skipRevalidationOnSearchChange, useUrlState } from "~/hooks/useUrlState";
import { site } from "~/site";
import { TOOLS } from "@src/calc/catalog";
import { checkField, type FieldCheck, type FieldSpec } from "@src/calc/fields";
import { formatMoney, formatNumber } from "@src/calc/number";
import { costoTarifa, curvaCostos, puntosDeCambio, type CostoTarifa, type ModoEscalones, type Tarifa } from "@src/calc/tarifas";
import type { Route } from "./+types/herramientas.tarifas";

const TOOL = TOOLS.find((t) => t.id === "comparador-tarifas")!;
const TarifasChart = lazy(() => import("~/components/calc/ToolCharts").then((m) => ({ default: m.TarifasChart })));

export async function loader() {
  return { notes: getToolNotes(TOOL.id) };
}
export const shouldRevalidate = skipRevalidationOnSearchChange;
export function meta() {
  return [{ title: `${TOOL.title} · ${site.name}` }, { name: "description", content: TOOL.summary }];
}

// ------------------------------------------------------------------ campos

const MONEY_MAX = 1e12;
const G = {
  consumo: {
    id: "consumo",
    label: "Consumo del período",
    unit: "kWh",
    min: 1,
    max: 10_000_000,
    subject: "El consumo",
    example: "400",
    hint: "Lo que figura en tu factura para el período (mes o bimestre). Todos los montos de abajo tienen que ser del mismo período.",
  },
  potencia: {
    id: "potencia",
    label: "Potencia contratada o demandada",
    unit: "kW",
    min: 0.1,
    max: 100_000,
    decimals: 1,
    subject: "La potencia",
    example: "10",
    hint: "Hace falta porque alguna tarifa tiene cargo por potencia. Figura en la factura.",
  },
} satisfies Record<string, FieldSpec>;

const T = {
  fijo: { id: "fijo", label: "Cargo fijo", unit: "$/período", min: 0, max: MONEY_MAX, decimals: 2, subject: "El cargo fijo", example: "2500" },
  precio: {
    id: "precio",
    label: "Precio de la energía",
    unit: "$/kWh",
    min: 0.01,
    max: MONEY_MAX,
    decimals: 2,
    subject: "El precio",
    example: "150",
    hint: "El cargo variable. Si tiene escalones, este es el del primero; el resto va en Opciones avanzadas.",
  },
  desde2: {
    id: "desde2",
    label: "Segundo escalón: desde",
    unit: "kWh",
    min: 1,
    max: 10_000_000,
    subject: "El inicio del escalón",
    example: "300",
  },
  precio2: { id: "precio2", label: "Segundo escalón: precio", unit: "$/kWh", min: 0.01, max: MONEY_MAX, decimals: 2, subject: "El precio", example: "200" },
  cpot: {
    id: "cpot",
    label: "Cargo por potencia",
    unit: "$/kW",
    min: 0,
    max: MONEY_MAX,
    decimals: 2,
    subject: "El cargo por potencia",
    example: "1000",
    hint: "Solo en tarifas con potencia contratada (comercios, industrias).",
  },
  imp: {
    id: "imp",
    label: "Impuestos y tasas",
    unit: "%",
    min: 0,
    max: 200,
    decimals: 1,
    subject: "Los impuestos",
    plural: true,
    example: "27",
    hint: "Los que se cobran como porcentaje sobre el total. Si alguno es un monto fijo, sumalo al cargo fijo.",
  },
} satisfies Record<string, FieldSpec>;

type TKey = keyof typeof T | "nombre" | "modo";
const KEYS: TKey[] = ["nombre", "fijo", "precio", "desde2", "precio2", "modo", "cpot", "imp"];
const tariffDefaults = (letter: "a" | "b") =>
  Object.fromEntries(KEYS.map((k) => [`${letter}_${k}`, k === "nombre" ? `Tarifa ${letter.toUpperCase()}` : k === "modo" ? "escalonado" : ""]));

const DEFAULTS = { consumo: "", potencia: "", ...tariffDefaults("a"), ...tariffDefaults("b") } as Record<string, string>;

interface ParsedTariff {
  tarifa: Tarifa | null;
  missing: string[];
  errors: boolean;
  escalonError: string | null;
  checks: Record<keyof typeof T, FieldCheck>;
}

function parseTariff(v: Record<string, string>, letter: "a" | "b"): ParsedTariff {
  const get = (k: TKey) => v[`${letter}_${k}`] ?? "";
  const nombre = get("nombre").trim() || `Tarifa ${letter.toUpperCase()}`;
  const checks = {
    fijo: checkField(T.fijo, get("fijo"), true),
    precio: checkField(T.precio, get("precio"), true),
    desde2: checkField(T.desde2, get("desde2"), false),
    precio2: checkField(T.precio2, get("precio2"), false),
    cpot: checkField(T.cpot, get("cpot"), false),
    imp: checkField(T.imp, get("imp"), false),
  };
  const missing: string[] = [];
  if (checks.fijo.value == null) missing.push(`${nombre}: ${T.fijo.label}`);
  if (checks.precio.value == null) missing.push(`${nombre}: ${T.precio.label}`);

  const d2 = get("desde2").trim() !== "";
  const p2 = get("precio2").trim() !== "";
  const escalonError =
    d2 !== p2 ? "Completá desde cuántos kWh empieza el segundo escalón y su precio, o dejá los dos vacíos." : null;
  const errors = Object.values(checks).some((c) => c.error != null) || escalonError != null;

  let tarifa: Tarifa | null = null;
  if (missing.length === 0 && !errors) {
    const escalones = [{ desdeKwh: 0, precio: checks.precio.value! }];
    if (checks.desde2.value != null && checks.precio2.value != null) {
      escalones.push({ desdeKwh: checks.desde2.value, precio: checks.precio2.value });
    }
    tarifa = {
      nombre,
      cargoFijo: checks.fijo.value!,
      escalones,
      modo: (get("modo") === "categoria" ? "categoria" : "escalonado") as ModoEscalones,
      cargoPotencia: checks.cpot.value ?? 0,
      impuestos: (checks.imp.value ?? 0) / 100,
    };
  }
  return { tarifa, missing, errors, escalonError, checks };
}

// ------------------------------------------------------------------ página

export default function TarifasPage({ loaderData }: Route.ComponentProps) {
  const { notes } = loaderData;
  const { values: v, set, reset } = useUrlState(DEFAULTS);

  const a = parseTariff(v, "a");
  const b = parseTariff(v, "b");
  const consumo = checkField(G.consumo, v.consumo!, true);
  const needsPotencia = (a.checks.cpot.value ?? 0) > 0 || (b.checks.cpot.value ?? 0) > 0;
  const potencia = checkField(G.potencia, v.potencia!, needsPotencia);

  const missing = [
    ...(consumo.value == null ? [G.consumo.label] : []),
    ...(needsPotencia && potencia.value == null ? [G.potencia.label] : []),
    ...a.missing,
    ...b.missing,
  ];
  const hasErrors = a.errors || b.errors || consumo.error != null || potencia.error != null;

  let comp: { ca: CostoTarifa; cb: CostoTarifa; curva: Record<string, number>[]; cambios: number[]; max: number } | null = null;
  if (a.tarifa && b.tarifa && consumo.value != null && (!needsPotencia || potencia.value != null) && !hasErrors) {
    const kw = potencia.value ?? 0;
    const max = Math.max(100, Math.ceil(consumo.value * 2));
    comp = {
      ca: costoTarifa(a.tarifa, consumo.value, kw),
      cb: costoTarifa(b.tarifa, consumo.value, kw),
      curva: curvaCostos([a.tarifa, b.tarifa], max, kw),
      cambios: puntosDeCambio(a.tarifa, b.tarifa, max, kw),
      max,
    };
  }

  const form = (
    <FormCard onReset={reset}>
      <NumberField spec={G.consumo} value={v.consumo!} onChange={(x) => set("consumo", x)} required />
      {needsPotencia && <NumberField spec={G.potencia} value={v.potencia!} onChange={(x) => set("potencia", x)} required />}
      <TariffFields letter="a" v={v} set={set} parsed={a} />
      <TariffFields letter="b" v={v} set={set} parsed={b} />
    </FormCard>
  );

  const result = (
    <>
      <ResultCard missing={missing} hasErrors={hasErrors}>
        {comp && a.tarifa && b.tarifa && <Comparison a={a.tarifa} b={b.tarifa} {...comp} consumo={consumo.value!} potenciaKw={potencia.value ?? 0} />}
      </ResultCard>
      {comp && a.tarifa && b.tarifa && (
        <ChartCard>
          <Suspense fallback={<p className="flex h-[22rem] items-center justify-center text-base text-muted">Cargando el gráfico…</p>}>
            <TarifasChart curva={comp.curva} nombres={[a.tarifa.nombre, b.tarifa.nombre]} consumo={consumo.value!} />
          </Suspense>
        </ChartCard>
      )}
      <Assumptions tool={TOOL} formula="total = (cargo fijo + energía + potencia) × (1 + impuestos)" notes={notes}>
        <li>
          <strong>Todos los valores son datos tuyos</strong>, del cuadro tarifario o de tu factura. El sitio no tiene
          tarifas cargadas: cambian seguido y dependen de la distribuidora.
        </li>
        <li>
          <strong>Mismo período:</strong> consumo, cargo fijo y escalones tienen que ser del mismo período de
          facturación (mes o bimestre).
        </li>
        <li>
          <strong>Escalones:</strong> “escalonado” cobra cada tramo a su precio; “por categoría” cobra todo el consumo al
          precio del escalón alcanzado. Elegí el que usa tu distribuidora: con el otro el resultado sale distinto.
        </li>
        <li>Los impuestos se aplican como porcentaje sobre el subtotal. No incluye subsidios salvo que ya estén en los precios que cargaste.</li>
        <li>
          Conceptos: <NoteLink notes={notes} title="Potencia y energía" label="la diferencia entre kW y kWh" inline />.
        </li>
      </Assumptions>
    </>
  );

  return <ToolShell tool={TOOL} form={form} result={result} />;
}

// ------------------------------------------------------------------ piezas

function TariffFields({
  letter,
  v,
  set,
  parsed,
}: {
  letter: "a" | "b";
  v: Record<string, string>;
  set: (k: string, x: string) => void;
  parsed: ParsedTariff;
}) {
  const id = useId();
  const k = (key: TKey) => `${letter}_${key}`;
  const field = (key: keyof typeof T, required = false) => (
    <NumberField spec={T[key]} value={v[k(key)] ?? ""} onChange={(x) => set(k(key), x)} required={required} />
  );
  const modo = v[k("modo")] === "categoria" ? "categoria" : "escalonado";

  return (
    <fieldset className="flex flex-col gap-6 rounded-xl border border-border p-4">
      <legend className="px-1 text-lg font-bold">Tarifa {letter.toUpperCase()}</legend>
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-nombre`} className="font-semibold">
          Nombre <span className="text-sm font-normal text-muted">(para reconocerla en el resultado)</span>
        </label>
        <input
          id={`${id}-nombre`}
          type="text"
          value={v[k("nombre")] ?? ""}
          onChange={(e) => set(k("nombre"), e.target.value)}
          maxLength={40}
          autoComplete="off"
          className="min-h-12 rounded-xl border border-border bg-bg px-3.5 text-lg text-ink outline-none focus:border-link"
        />
      </div>
      {field("fijo", true)}
      {field("precio", true)}
      <AdvancedOptions>
        {field("desde2")}
        {field("precio2")}
        <p aria-live="polite" className="-mt-4 text-base font-medium text-[var(--c-danger)] empty:hidden">
          {parsed.escalonError ?? ""}
        </p>
        <fieldset>
          <legend className="font-semibold">Cómo se aplican los escalones</legend>
          <div className="mt-2 flex flex-col gap-1">
            {(
              [
                ["escalonado", "Escalonado: cada tramo a su precio"],
                ["categoria", "Por categoría: todo el consumo al precio del escalón alcanzado"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex min-h-11 cursor-pointer items-center gap-3">
                <input
                  type="radio"
                  name={`${id}-modo`}
                  value={value}
                  checked={modo === value}
                  onChange={() => set(k("modo"), value)}
                  className="size-5 accent-[var(--link)]"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        {field("cpot")}
        {field("imp")}
      </AdvancedOptions>
    </fieldset>
  );
}

function Comparison({
  a,
  b,
  ca,
  cb,
  cambios,
  consumo,
  potenciaKw,
}: {
  a: Tarifa;
  b: Tarifa;
  ca: CostoTarifa;
  cb: CostoTarifa;
  cambios: number[];
  consumo: number;
  potenciaKw: number;
}) {
  const diff = Math.abs(ca.total - cb.total);
  const iguales = diff < 0.005;
  const barata = ca.total <= cb.total ? a : b;
  const costoMayor = Math.max(ca.total, cb.total);
  const money = (n: number) => formatMoney(n);
  const conPotencia = ca.potencia > 0 || cb.potencia > 0;

  // Qué tarifa conviene a partir de cada punto de cambio.
  const tramos = cambios.map((kwh) => ({
    kwh,
    nombre: costoTarifa(a, kwh, potenciaKw).total <= costoTarifa(b, kwh, potenciaKw).total ? a.nombre : b.nombre,
  }));

  return (
    <div className="mt-4">
      <p className="text-sm font-semibold uppercase tracking-widest text-amber-text">
        Con {formatNumber(consumo)} kWh en el período
      </p>
      {iguales ? (
        <p className="mt-1 text-3xl font-bold">Las dos tarifas cuestan lo mismo.</p>
      ) : (
        <>
          <p className="mt-1 text-3xl font-bold">Conviene {barata.nombre}</p>
          <p className="mt-2 text-lg">
            Pagarías <strong>{money(diff)} menos</strong> por período ({formatNumber((diff / costoMayor) * 100, 1)} % menos).
          </p>
        </>
      )}

      <div className="mt-6 overflow-x-auto border-t border-border pt-5">
        <table className="w-full text-left text-base tabular-nums">
          <caption className="sr-only">Desglose del costo de cada tarifa</caption>
          <thead className="text-sm text-muted">
            <tr>
              <th scope="col" className="py-2 pr-4 font-semibold">Concepto</th>
              <th scope="col" className="py-2 pr-4 text-right font-semibold">{a.nombre}</th>
              <th scope="col" className="py-2 text-right font-semibold">{b.nombre}</th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                ["Cargo fijo", ca.fijo, cb.fijo],
                ["Energía", ca.energia, cb.energia],
                ...(conPotencia ? [["Potencia", ca.potencia, cb.potencia] as const] : []),
                ["Impuestos y tasas", ca.impuestos, cb.impuestos],
              ] as const
            ).map(([label, x, y]) => (
              <tr key={label} className="border-t border-border">
                <th scope="row" className="py-2 pr-4 font-medium">{label}</th>
                <td className="py-2 pr-4 text-right">{money(x)}</td>
                <td className="py-2 text-right">{money(y)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-ink/40 font-bold">
              <th scope="row" className="py-2 pr-4">Total</th>
              <td className="py-2 pr-4 text-right">{money(ca.total)}</td>
              <td className="py-2 text-right">{money(cb.total)}</td>
            </tr>
            <tr className="text-muted">
              <th scope="row" className="py-2 pr-4 font-medium">Precio medio por kWh</th>
              <td className="py-2 pr-4 text-right">{money(ca.precioMedio)}</td>
              <td className="py-2 text-right">{money(cb.precioMedio)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {tramos.length > 0 && (
        <ul className="mt-5 list-disc space-y-1 pl-5 text-base">
          {tramos.map((t) => (
            <li key={t.kwh}>
              Desde <strong>{formatNumber(t.kwh)} kWh</strong> conviene <strong>{t.nombre}</strong>.
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
