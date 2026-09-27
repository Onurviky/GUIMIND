import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatNumber } from "@src/calc/number";
import { axisTick, formatAxis, gridProps, SERIES, tooltipProps } from "./chartTheme";

/**
 * Gráficos de las calculadoras. Este módulo se carga de forma diferida (con
 * Recharts) recién cuando hay un resultado. Cada gráfico trae su tabla.
 */

function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <details className="mt-3">
      <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-link underline underline-offset-4">
        Ver los datos en una tabla
      </summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left text-base tabular-nums">
          <thead className="border-b border-border text-sm text-muted">
            <tr>
              {head.map((h, i) => (
                <th key={h} scope="col" className={`py-2 pr-4 font-semibold ${i > 0 ? "text-right" : ""}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-border last:border-0">
                {r.map((c, j) =>
                  j === 0 ? (
                    <th key={j} scope="row" className="py-2 pr-4 font-medium">
                      {c}
                    </th>
                  ) : (
                    <td key={j} className="py-2 pr-4 text-right">
                      {c}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function Figure({ caption, label, children }: { caption: string; label: string; children: React.ReactElement }) {
  return (
    <>
      <figcaption className="text-base font-semibold">{caption}</figcaption>
      <div className="mt-3 h-72 w-full" role="img" aria-label={label}>
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </>
  );
}

const money = (n: number) => `$ ${formatNumber(n)}`;
const usd = (n: number) => `USD ${formatNumber(n)}`;

// ------------------------------------------------------------ eficiencia

export function EficienciaChart({
  actualKwh,
  nuevoKwh,
  acumulado,
  inversion,
}: {
  actualKwh: number;
  nuevoKwh: number;
  acumulado: { mes: number; ahorroAcumulado: number }[] | null;
  inversion: number | null;
}) {
  if (acumulado && inversion) {
    return (
      <figure className="m-0">
        <Figure
          caption="Ahorro acumulado frente a la inversión ($)"
          label="Línea de ahorro acumulado mes a mes con una línea horizontal en el monto de la inversión. Los valores están en la tabla."
        >
          <LineChart data={acumulado} margin={{ top: 16, right: 12, bottom: 14, left: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="mes" tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--border)" }} label={{ value: "meses", position: "insideBottomRight", offset: -2, fill: "var(--muted)", fontSize: 13 }} />
            <YAxis tick={axisTick} tickLine={false} axisLine={false} tickFormatter={formatAxis} width={72} />
            <Tooltip {...tooltipProps} formatter={(v) => [money(Number(v)), "Ahorro acumulado"]} labelFormatter={(m) => `Mes ${m}`} />
            <ReferenceLine y={inversion} stroke="var(--ink)" strokeDasharray="6 4" label={{ value: "Inversión", position: "insideTopLeft", fill: "var(--ink)", fontSize: 13 }} />
            <Line dataKey="ahorroAcumulado" stroke={SERIES.a} strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </Figure>
        <DataTable
          head={["Mes", "Ahorro acumulado ($)"]}
          rows={acumulado.filter((p) => p.mes % 3 === 0).map((p) => [p.mes, formatNumber(p.ahorroAcumulado)])}
        />
      </figure>
    );
  }
  const data = [
    { nombre: "Equipo actual", kwh: actualKwh },
    { nombre: "Equipo nuevo", kwh: nuevoKwh },
  ];
  return (
    <figure className="m-0">
      <Figure caption="Consumo por mes (kWh)" label="Barras del consumo mensual del equipo actual y del nuevo. Los valores están en la tabla.">
        <BarChart data={data} margin={{ top: 24, right: 12, bottom: 0, left: 0 }} barCategoryGap="35%">
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="nombre" tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--border)" }} />
          <YAxis tick={axisTick} tickLine={false} axisLine={false} tickFormatter={formatAxis} width={56} />
          <Tooltip {...tooltipProps} cursor={{ fill: "var(--surface-2)" }} formatter={(v) => [`${formatNumber(Number(v), 1)} kWh`, "Consumo"]} />
          <Bar dataKey="kwh" radius={[4, 4, 0, 0]} maxBarSize={72} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.nombre} fill={SERIES.a} />
            ))}
            <LabelList dataKey="kwh" position="top" formatter={(v) => `${formatNumber(Number(v), 1)} kWh`} fill="var(--ink)" fontSize={13} />
          </Bar>
        </BarChart>
      </Figure>
      <DataTable head={["Equipo", "Consumo (kWh/mes)"]} rows={data.map((d) => [d.nombre, formatNumber(d.kwh, 1)])} />
    </figure>
  );
}

// ------------------------------------------------------------ tarifas

export function TarifasChart({
  curva,
  nombres,
  consumo,
}: {
  curva: Record<string, number>[];
  nombres: [string, string];
  consumo: number;
}) {
  return (
    <figure className="m-0">
      <Figure
        caption="Costo de la factura según el consumo ($ por período)"
        label={`Dos líneas con el costo de ${nombres[0]} y ${nombres[1]} para distintos consumos, y una línea vertical en tu consumo. Los valores están en la tabla.`}
      >
        <LineChart data={curva} margin={{ top: 8, right: 12, bottom: 14, left: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="kwh" type="number" domain={[0, "dataMax"]} tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--border)" }} tickFormatter={(v: number) => `${formatNumber(v)}`} label={{ value: "kWh", position: "insideBottomRight", offset: -2, fill: "var(--muted)", fontSize: 13 }} />
          <YAxis tick={axisTick} tickLine={false} axisLine={false} tickFormatter={formatAxis} width={72} />
          <Tooltip {...tooltipProps} labelFormatter={(k) => `${formatNumber(Number(k))} kWh`} formatter={(v, name) => [money(Number(v)), name === "t0" ? nombres[0] : nombres[1]]} />
          <Legend verticalAlign="top" align="left" height={36} iconSize={12} formatter={(value) => <span style={{ color: "var(--ink)", fontSize: 14 }}>{value === "t0" ? nombres[0] : nombres[1]}</span>} />
          <ReferenceLine x={consumo} stroke="var(--ink)" strokeDasharray="6 4" label={{ value: "Tu consumo", position: "insideTopRight", fill: "var(--ink)", fontSize: 13 }} />
          <Line dataKey="t0" stroke={SERIES.a} strokeWidth={2} dot={false} isAnimationActive={false} type="linear" />
          <Line dataKey="t1" stroke={SERIES.b} strokeWidth={2} strokeDasharray="8 4" dot={false} isAnimationActive={false} type="linear" />
        </LineChart>
      </Figure>
      <DataTable
        head={["Consumo (kWh)", `${nombres[0]} ($)`, `${nombres[1]} ($)`]}
        rows={curva.filter((_, i) => i % 6 === 0).map((p) => [formatNumber(p.kwh!), formatNumber(p.t0!), formatNumber(p.t1!)])}
      />
    </figure>
  );
}

// ------------------------------------------------------------ retorno

export function RoiChart({ anios, inversion }: { anios: { anio: number; acumuladoUsd: number }[]; inversion: number }) {
  const data = [{ anio: 0, acumuladoUsd: -inversion }, ...anios];
  return (
    <figure className="m-0">
      <Figure
        caption="Flujo acumulado de la inversión (USD)"
        label="Línea del resultado acumulado año a año: empieza negativa por la inversión y cruza cero en el año de repago. Los valores están en la tabla."
      >
        <LineChart data={data} margin={{ top: 16, right: 12, bottom: 14, left: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="anio" tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--border)" }} label={{ value: "años", position: "insideBottomRight", offset: -2, fill: "var(--muted)", fontSize: 13 }} />
          <YAxis tick={axisTick} tickLine={false} axisLine={false} tickFormatter={formatAxis} width={72} />
          <Tooltip {...tooltipProps} formatter={(v) => [usd(Number(v)), "Acumulado"]} labelFormatter={(a) => `Año ${a}`} />
          <ReferenceLine y={0} stroke="var(--ink)" label={{ value: "Recuperado", position: "insideTopLeft", fill: "var(--ink)", fontSize: 13 }} />
          <Line dataKey="acumuladoUsd" stroke={SERIES.a} strokeWidth={2} dot={{ r: 4, fill: SERIES.a, stroke: "var(--surface)", strokeWidth: 2 }} isAnimationActive={false} />
        </LineChart>
      </Figure>
      <DataTable head={["Año", "Acumulado (USD)"]} rows={data.map((d) => [d.anio, formatNumber(d.acumuladoUsd)])} />
    </figure>
  );
}
