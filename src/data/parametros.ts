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
} satisfies Record<string, Parametro>;

export type ParametroId = keyof typeof PARAMETROS;

export function parametrosFaltantes(ids: readonly ParametroId[]): ParametroId[] {
  return ids.filter((id) => PARAMETROS[id].valor === null);
}
