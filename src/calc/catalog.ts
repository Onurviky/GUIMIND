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
];

/** Links a notas ya resueltos en el build (generated/tools.json). */
export interface ToolLinks {
  id: string;
  notes: { title: string; slug: string }[];
}
