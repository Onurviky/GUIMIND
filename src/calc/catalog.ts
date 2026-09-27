import type { ParametroId } from "../data/parametros";

/**
 * Catálogo de calculadoras. Solo datos (sin React): lo usan el build (para
 * validar los links a notas) y el sitio (para listar las herramientas).
 */
export interface ToolMeta {
  id: string;
  title: string;
  /** Qué resuelve, en una frase. */
  summary: string;
  /** Título de las notas del vault que explican los conceptos usados. */
  conceptNotes: string[];
  /** Parámetros del sector que usa (src/data/parametros.ts). */
  params: ParametroId[];
  /** Última revisión del modelo de cálculo, AAAA-MM-DD. */
  revisado: string;
}

export const TOOLS: ToolMeta[] = [
  {
    id: "dimensionamiento-solar",
    title: "Dimensionamiento solar",
    summary: "Cuántos kWp de paneles necesitás para cubrir tu consumo eléctrico, y cuánto generarían por mes.",
    conceptNotes: ["Potencia y energía", "Potencia pico", "Horas sol pico", "Performance ratio", "Generación distribuida"],
    params: ["performanceRatio", "potenciaPanelWp"],
    revisado: "2026-09-27",
  },
  {
    id: "retorno-solar",
    title: "Retorno de una instalación solar",
    summary: "En cuántos años se recupera la inversión en paneles, calculado en dólares para no confundir inflación con ahorro.",
    conceptNotes: ["Generación distribuida", "Energía solar fotovoltaica", "Potencia y energía"],
    params: ["tipoCambio", "degradacionAnual"],
    revisado: "2026-09-27",
  },
  {
    id: "ahorro-eficiencia",
    title: "Ahorro por eficiencia",
    summary: "Cuánta energía y plata ahorrás al reemplazar equipos por otros más eficientes, y en cuánto tiempo se paga el cambio.",
    conceptNotes: ["Potencia y energía", "Eficiencia energética"],
    params: [],
    revisado: "2026-09-27",
  },
  {
    id: "comparador-tarifas",
    title: "Comparador de tarifas",
    summary: "Cuánto pagarías con dos tarifas distintas según tu consumo, y a partir de qué consumo conviene cada una.",
    conceptNotes: ["Potencia y energía", "Tarifas eléctricas"],
    params: [],
    revisado: "2026-09-27",
  },
];

/** Links a notas ya resueltos en el build (generated/tools.json). */
export interface ToolLinks {
  id: string;
  notes: { title: string; slug: string }[];
}
