import { formatNumber } from "@src/calc/number";

/**
 * Estilo común de los gráficos (Recharts): grilla y ejes discretos, textos con
 * los colores de texto (nunca con el color de la serie).
 * Series validadas con el script de daltonismo: 1 = azul, 2 = naranja.
 */
export const SERIES = { a: "var(--series-1)", b: "var(--series-2)" } as const;

export const axisTick = { fill: "var(--muted)", fontSize: 13 } as const;

export const gridProps = { vertical: false, stroke: "var(--border)" } as const;

export const tooltipProps = {
  contentStyle: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    color: "var(--ink)",
    fontSize: 14,
  },
  labelStyle: { color: "var(--ink)", fontWeight: 600 },
  itemStyle: { color: "var(--ink)" },
} as const;

export const formatAxis = (v: number) => formatNumber(v);
