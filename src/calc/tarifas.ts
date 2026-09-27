/**
 * Costo de una factura eléctrica según su estructura tarifaria.
 * Todo es "por período de facturación" (mes o bimestre, según la factura):
 * consumo, cargo fijo y límites de escalones tienen que estar en el mismo período.
 *
 *   Total = (cargo fijo + energía + potencia) × (1 + impuestos)
 *
 * Escalones de energía, dos formas de aplicarlos (depende de la distribuidora):
 *   - "escalonado": cada tramo se cobra a su precio (como el impuesto a las ganancias).
 *   - "categoria":  el consumo total define la categoría y TODO se cobra a ese precio.
 *     Produce saltos: pasar el límite por 1 kWh encarece todo el consumo.
 */
export type ModoEscalones = "escalonado" | "categoria";

export interface Escalon {
  /** Desde qué consumo del período aplica [kWh]. El primero es 0. */
  desdeKwh: number;
  /** Precio de la energía en este escalón [$/kWh]. */
  precio: number;
}

export interface Tarifa {
  nombre: string;
  /** Cargo fijo por período [$]. */
  cargoFijo: number;
  /** Ordenados por desdeKwh; el primero con desdeKwh = 0. */
  escalones: Escalon[];
  modo: ModoEscalones;
  /** Cargo por potencia [$/kW por período]. 0 si no tiene. */
  cargoPotencia: number;
  /** Impuestos y tasas sobre el subtotal [0-1]. */
  impuestos: number;
}

export interface CostoTarifa {
  fijo: number;
  energia: number;
  potencia: number;
  impuestos: number;
  total: number;
  /** Precio medio que se paga por kWh, con todo incluido [$/kWh]. */
  precioMedio: number;
}

export function validarTarifa(t: Tarifa): void {
  if (t.escalones.length === 0) throw new RangeError(`${t.nombre}: falta el precio de la energía`);
  if (t.escalones[0]!.desdeKwh !== 0) throw new RangeError(`${t.nombre}: el primer escalón debe empezar en 0 kWh`);
  for (let i = 1; i < t.escalones.length; i++) {
    if (!(t.escalones[i]!.desdeKwh > t.escalones[i - 1]!.desdeKwh)) {
      throw new RangeError(`${t.nombre}: los escalones deben estar en orden creciente`);
    }
  }
  for (const v of [t.cargoFijo, t.cargoPotencia, ...t.escalones.map((e) => e.precio)]) {
    if (!(Number.isFinite(v) && v >= 0)) throw new RangeError(`${t.nombre}: montos inválidos`);
  }
  if (!(t.impuestos >= 0 && t.impuestos < 5)) throw new RangeError(`${t.nombre}: impuestos inválidos`);
}

export function costoEnergia(t: Tarifa, consumoKwh: number): number {
  if (consumoKwh <= 0) return 0;
  const esc = t.escalones;
  if (t.modo === "categoria") {
    let actual = esc[0]!;
    for (const e of esc) if (consumoKwh >= e.desdeKwh) actual = e;
    return consumoKwh * actual.precio;
  }
  let total = 0;
  for (let i = 0; i < esc.length; i++) {
    const desde = esc[i]!.desdeKwh;
    const hasta = esc[i + 1]?.desdeKwh ?? Infinity;
    if (consumoKwh <= desde) break;
    total += (Math.min(consumoKwh, hasta) - desde) * esc[i]!.precio;
  }
  return total;
}

export function costoTarifa(t: Tarifa, consumoKwh: number, potenciaKw = 0): CostoTarifa {
  validarTarifa(t);
  if (!(consumoKwh >= 0)) throw new RangeError("consumo inválido");
  const fijo = t.cargoFijo;
  const energia = costoEnergia(t, consumoKwh);
  const potencia = t.cargoPotencia * Math.max(0, potenciaKw);
  const subtotal = fijo + energia + potencia;
  const impuestos = subtotal * t.impuestos;
  const total = subtotal + impuestos;
  return { fijo, energia, potencia, impuestos, total, precioMedio: consumoKwh > 0 ? total / consumoKwh : 0 };
}

/** Costo total de cada tarifa para consumos de 0 a maxKwh (para graficar). */
export function curvaCostos(tarifas: Tarifa[], maxKwh: number, potenciaKw = 0, pasos = 60) {
  return Array.from({ length: pasos + 1 }, (_, i) => {
    const kwh = (maxKwh * i) / pasos;
    const punto: Record<string, number> = { kwh };
    tarifas.forEach((t, j) => (punto[`t${j}`] = costoTarifa(t, kwh, potenciaKw).total));
    return punto;
  });
}

/**
 * Consumos donde la tarifa más barata cambia (de 0 a maxKwh), con 1 kWh de precisión.
 * Sirve para decir "a partir de X kWh conviene B".
 */
export function puntosDeCambio(a: Tarifa, b: Tarifa, maxKwh: number, potenciaKw = 0): number[] {
  const diff = (kwh: number) => costoTarifa(a, kwh, potenciaKw).total - costoTarifa(b, kwh, potenciaKw).total;
  const cambios: number[] = [];
  let prev = Math.sign(diff(0));
  for (let kwh = 1; kwh <= Math.ceil(maxKwh); kwh++) {
    const s = Math.sign(diff(kwh));
    if (s !== 0 && prev !== 0 && s !== prev) cambios.push(kwh);
    if (s !== 0) prev = s;
  }
  return cambios;
}
