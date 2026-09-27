/**
 * Retorno de una inversión solar conectada a red, en DÓLARES.
 *
 * Se calcula en USD para no mezclar inflación con rentabilidad: con precios en
 * pesos nominales un repago "a 4 años" no significa nada. Los precios en pesos
 * se pasan a USD con el tipo de cambio que carga el usuario.
 *
 * Por año t = 1..N:
 *   generación_t  = generación año 1 × (1 − degradación)^(t−1)
 *   precio_t      = precio año 1 [USD/kWh] × (1 + variación real)^(t−1)
 *   ahorro_t      = generación_t × (autoconsumo × precio compra_t + (1 − autoconsumo) × precio inyección_t)
 *                   − mantenimiento
 *
 * Autoconsumo: la energía que usás en el momento evita comprarla (vale el
 * precio VARIABLE de compra). La inyectada vale lo que pague el esquema de
 * generación distribuida vigente (puede ser menos, o nada).
 */
export interface RoiInput {
  inversionUsd: number;
  generacionAnualKwh: number;
  /** Parte de la generación que se consume en el lugar [0-1]. */
  autoconsumo: number;
  /** Precio variable de compra de la energía [$/kWh]. */
  precioCompra: number;
  /** Valor de la energía inyectada [$/kWh]. Puede ser 0. */
  precioInyeccion: number;
  /** Pesos por dólar. */
  tipoCambio: number;
  mantenimientoUsdAnio: number;
  /** Pérdida anual de generación [0-1]. */
  degradacionAnual: number;
  /** Variación anual del precio de la energía en USD [fracción, puede ser negativa]. */
  variacionPrecioAnual: number;
  horizonteAnios: number;
  /** Tasa de descuento anual en USD [fracción]. Opcional: sin ella no hay VAN. */
  tasaDescuento?: number | null;
}

export interface AnioRoi {
  anio: number;
  generacionKwh: number;
  ahorroUsd: number;
  acumuladoUsd: number;
}

export interface RoiResult {
  anios: AnioRoi[];
  ahorroAnio1Usd: number;
  /** Años hasta recuperar la inversión (con fracción); null si no se recupera en el horizonte. */
  repagoAnios: number | null;
  /** Suma de ahorros netos − inversión, sin descontar. */
  gananciaNetaUsd: number;
  vanUsd: number | null;
  /** Tasa interna de retorno anual; null si no existe en el rango [-99 %, 100 %]. */
  tir: number | null;
}

export function calcularRoi(i: RoiInput): RoiResult {
  const positivos = { inversionUsd: i.inversionUsd, generacionAnualKwh: i.generacionAnualKwh, precioCompra: i.precioCompra, tipoCambio: i.tipoCambio };
  for (const [k, v] of Object.entries(positivos)) {
    if (!(Number.isFinite(v) && v > 0)) throw new RangeError(`${k} debe ser positivo (recibido: ${v})`);
  }
  if (!(i.autoconsumo >= 0 && i.autoconsumo <= 1)) throw new RangeError("autoconsumo debe estar en [0, 1]");
  if (!(i.precioInyeccion >= 0)) throw new RangeError("precioInyeccion no puede ser negativo");
  if (!(i.mantenimientoUsdAnio >= 0)) throw new RangeError("mantenimiento no puede ser negativo");
  if (!(i.degradacionAnual >= 0 && i.degradacionAnual < 1)) throw new RangeError("degradación inválida");
  if (!(i.variacionPrecioAnual > -1)) throw new RangeError("variación de precio inválida");
  if (!(Number.isInteger(i.horizonteAnios) && i.horizonteAnios >= 1 && i.horizonteAnios <= 50)) {
    throw new RangeError("horizonte debe ser un entero entre 1 y 50");
  }

  const compraUsd = i.precioCompra / i.tipoCambio;
  const inyeccionUsd = i.precioInyeccion / i.tipoCambio;

  const flujos: number[] = [];
  const anios: AnioRoi[] = [];
  let acumulado = -i.inversionUsd;
  let repagoAnios: number | null = null;

  for (let t = 1; t <= i.horizonteAnios; t++) {
    const gen = i.generacionAnualKwh * (1 - i.degradacionAnual) ** (t - 1);
    const escala = (1 + i.variacionPrecioAnual) ** (t - 1);
    const valorKwh = i.autoconsumo * compraUsd * escala + (1 - i.autoconsumo) * inyeccionUsd * escala;
    const ahorro = gen * valorKwh - i.mantenimientoUsdAnio;
    const antes = acumulado;
    acumulado += ahorro;
    if (repagoAnios === null && antes < 0 && acumulado >= 0) {
      // Interpolación lineal dentro del año (el ahorro llega repartido en el año).
      repagoAnios = t - 1 + -antes / ahorro;
    }
    flujos.push(ahorro);
    anios.push({ anio: t, generacionKwh: gen, ahorroUsd: ahorro, acumuladoUsd: acumulado });
  }

  const van =
    i.tasaDescuento == null ? null : -i.inversionUsd + flujos.reduce((s, f, k) => s + f / (1 + i.tasaDescuento!) ** (k + 1), 0);

  return {
    anios,
    ahorroAnio1Usd: flujos[0]!,
    repagoAnios,
    gananciaNetaUsd: acumulado,
    vanUsd: van,
    tir: tir(i.inversionUsd, flujos),
  };
}

/** TIR por bisección: tasa r con VAN(r) = 0. */
export function tir(inversion: number, flujos: number[]): number | null {
  const van = (r: number) => -inversion + flujos.reduce((s, f, k) => s + f / (1 + r) ** (k + 1), 0);
  let lo = -0.99;
  let hi = 1;
  let vLo = van(lo);
  const vHi = van(hi);
  if (Math.sign(vLo) === Math.sign(vHi)) return null;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    const vMid = van(mid);
    if (Math.abs(vMid) < 1e-9 || hi - lo < 1e-10) return mid;
    if (Math.sign(vMid) === Math.sign(vLo)) {
      lo = mid;
      vLo = vMid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}
