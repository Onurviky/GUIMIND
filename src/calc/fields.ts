import { formatNumber, parseDecimal } from "./number";

/** Definición de un dato numérico de una calculadora. */
export interface FieldSpec {
  id: string;
  label: string;
  /** Unidad visible junto al campo: "kWh/mes", "h/día", "%". */
  unit: string;
  min: number;
  max: number;
  /** Paso del slider (si lo tiene). */
  step?: number;
  /** Decimales para mostrar valores en mensajes. */
  decimals?: number;
  /** Nombre en los mensajes de error: "El consumo", "Las horas sol pico". */
  subject: string;
  /** El sujeto es plural ("Las horas sol pico deben…"). */
  plural?: boolean;
  /** Ejemplo para el mensaje de error: "350". */
  example?: string;
  /** Ayuda breve debajo del campo. */
  hint?: string;
  slider?: boolean;
}

export type FieldCheck = { value: number; error: null } | { value: null; error: string | null };

/**
 * Valida un valor tipeado. El mensaje dice qué está mal y cómo corregirlo.
 * Un campo vacío no es error salvo que sea obligatorio (error: null, value: null).
 */
export function checkField(spec: FieldSpec, raw: string, required: boolean): FieldCheck {
  if (!raw.trim()) {
    return { value: null, error: required ? `Completá este dato (${spec.unit}).` : null };
  }
  const n = parseDecimal(raw);
  if (n === null) {
    const example = spec.example ?? formatNumber(spec.min, spec.decimals ?? 0);
    return { value: null, error: `Ingresá solo un número, por ejemplo ${example}.` };
  }
  if (n < spec.min || n > spec.max) {
    const d = spec.decimals ?? 0;
    return {
      value: null,
      error: `${spec.subject} ${spec.plural ? "deben" : "debe"} estar entre ${formatNumber(spec.min, d)} y ${formatNumber(spec.max, d)} ${spec.unit}.`,
    };
  }
  return { value: n, error: null };
}
