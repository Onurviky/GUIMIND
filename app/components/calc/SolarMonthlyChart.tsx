import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MesSolar } from "@src/calc/solar";
import { formatNumber } from "@src/calc/number";

const GEN = "var(--series-1)";
const CONSUMO = "var(--series-2)";

/**
 * Generación estimada (barras) vs. consumo (línea) por mes, en kWh.
 * Un solo eje. Los textos usan los colores de texto, no los de las series.
 */
export function SolarMonthlyChart({ meses }: { meses: MesSolar[] }) {
  const data = meses.map((m) => ({
    mes: m.mes,
    generacion: Math.round(m.generacionKwh),
    consumo: Math.round(m.consumoKwh),
  }));

  return (
    <figure className="m-0">
      <figcaption className="text-base font-semibold">Generación estimada y consumo por mes (kWh)</figcaption>
      <div className="mt-3 h-72 w-full" role="img" aria-label="Gráfico de barras de generación mensual con una línea de consumo. Los valores están en la tabla de abajo.">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
            <XAxis
              dataKey="mes"
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              tick={{ fill: "var(--muted)", fontSize: 13 }}
              interval={0}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--muted)", fontSize: 13 }}
              tickFormatter={(v: number) => formatNumber(v)}
              width={56}
            />
            <Tooltip
              cursor={{ fill: "var(--surface-2)" }}
              formatter={(v, name) => [`${formatNumber(Number(v))} kWh`, name === "generacion" ? "Generación" : "Consumo"]}
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                color: "var(--ink)",
                fontSize: 14,
              }}
              labelStyle={{ color: "var(--ink)", fontWeight: 600 }}
              itemStyle={{ color: "var(--ink)" }}
            />
            <Legend
              verticalAlign="top"
              align="left"
              height={36}
              iconSize={12}
              formatter={(value) => (
                <span style={{ color: "var(--ink)", fontSize: 14 }}>{value === "generacion" ? "Generación estimada" : "Consumo"}</span>
              )}
            />
            <Bar dataKey="generacion" fill={GEN} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
            <Line
              dataKey="consumo"
              type="monotone"
              stroke={CONSUMO}
              strokeWidth={2}
              dot={{ r: 4, fill: CONSUMO, stroke: "var(--surface)", strokeWidth: 2 }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <details className="mt-3">
        <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-link underline underline-offset-4">
          Ver los datos en una tabla
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-base tabular-nums">
            <thead className="border-b border-border text-sm text-muted">
              <tr>
                <th scope="col" className="py-2 pr-4 font-semibold">Mes</th>
                <th scope="col" className="py-2 pr-4 text-right font-semibold">Generación (kWh)</th>
                <th scope="col" className="py-2 text-right font-semibold">Consumo (kWh)</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.mes} className="border-b border-border last:border-0">
                  <th scope="row" className="py-2 pr-4 font-medium">{d.mes}</th>
                  <td className="py-2 pr-4 text-right">{formatNumber(d.generacion)}</td>
                  <td className="py-2 text-right">{formatNumber(d.consumo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
