/**
 * Números como los escribe la gente en Argentina: "4,5", "4.5", "1.200", "1.200,5".
 * Devuelve null si no es un número.
 */
export function parseDecimal(raw: string): number | null {
  let s = raw.trim().replace(/\s+/g, "");
  if (!s) return null;
  if (s.includes(",")) {
    // Coma decimal: los puntos son separadores de miles.
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    // "1.200" o "12.500.000": puntos de miles.
    s = s.replace(/\./g, "");
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const formatters = new Map<number, Intl.NumberFormat>();

/** 1234.5 → "1.234,5" (es-AR). */
export function formatNumber(n: number, decimals = 0): string {
  let f = formatters.get(decimals);
  if (!f) {
    f = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: decimals });
    formatters.set(decimals, f);
  }
  return f.format(n);
}
