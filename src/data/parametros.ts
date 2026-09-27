import { formatNumber } from "../calc/number";

/**
 * Datos del sector que usan las calculadoras.
 *
 * REGLA: acá no se inventa nada. Cada valor lleva su fuente y fecha.
 * Mientras un valor sea null, la calculadora lo pide al usuario y el build
 * lo lista como pendiente.
 */
export interface Parametro {
  nombre: string;
  valor: number | null;
  unidad: string;
  /** De dónde sale el valor (documento, norma, relevamiento). */
  fuente: string | null;
  /** Fecha del dato, AAAA-MM-DD. */
  fecha: string | null;
  /** true si es una estimación o un valor típico, no un dato medido. */
  estimado: boolean;
  /** Para qué se usa y qué tener en cuenta. */
  nota: string;
}

export const PARAMETROS = {
  performanceRatio: {
    nombre: "Performance ratio de referencia",
    valor: null,
    unidad: "",
    fuente: null,
    fecha: null,
    estimado: true,
    nota: "Pérdidas totales del sistema (temperatura, cableado, inversor, suciedad, sombras). Depende de cada instalación.",
  },
  potenciaPanelWp: {
    nombre: "Potencia de un panel de referencia",
    valor: null,
    unidad: "Wp",
    fuente: null,
    fecha: null,
    estimado: false,
    nota: "Se usa solo para estimar la cantidad de paneles. Depende del modelo elegido.",
  },
  tipoCambio: {
    nombre: "Tipo de cambio de referencia",
    valor: null,
    unidad: "$/USD",
    fuente: null,
    fecha: null,
    estimado: false,
    nota: "Para pasar precios de la energía en pesos a dólares. Cambia seguido: siempre con fecha.",
  },
  degradacionAnual: {
    nombre: "Degradación anual de los paneles",
    valor: null,
    unidad: "%/año",
    fuente: null,
    fecha: null,
    estimado: true,
    nota: "Pérdida de generación por año. La declara el fabricante en la garantía de rendimiento.",
  },
} satisfies Record<string, Parametro>;

export type ParametroId = keyof typeof PARAMETROS;

export function parametrosFaltantes(ids: readonly ParametroId[]): ParametroId[] {
  return ids.filter((id) => PARAMETROS[id].valor === null);
}

/** Valor como texto para precargar un campo ("0,8"), o "" si falta. */
export function paramAsText(p: Parametro, decimals: number): string {
  return p.valor == null ? "" : formatNumber(p.valor, decimals).replace(/\./g, "");
}

/** "fuente, 27 de septiembre de 2026 (estimado)" o "dato tuyo". */
export function paramSource(p: Parametro, usedValue: number | null, formatDate: (iso: string) => string): string {
  if (p.valor == null || usedValue !== p.valor) return "dato tuyo";
  return `${p.fuente ?? "sin fuente"}${p.fecha ? `, ${formatDate(p.fecha)}` : ""}${p.estimado ? " (estimado)" : ""}`;
}
