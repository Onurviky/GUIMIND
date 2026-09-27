/**
 * Ahorro por reemplazar equipos por otros más eficientes.
 *
 *   Consumo [kWh/mes] = potencia [W] × cantidad × horas/día × días/mes × factor de uso / 1000
 *   Ahorro [kWh/mes]  = consumo actual − consumo nuevo
 *   Ahorro [$/mes]    = ahorro kWh × precio variable de la energía
 *
 * Supuestos (se muestran al usuario):
 *   - El precio es el VARIABLE ($/kWh): el cargo fijo de la factura no cambia.
 *     Con tarifas por escalones corresponde el precio del último escalón alcanzado.
 *   - Factor de uso: heladeras, aires y equipos con termostato no funcionan a
 *     plena potencia todo el tiempo. Con 100 % se sobreestima su consumo.
 *   - El repago es simple (sin intereses) y usa el precio actual de la energía.
 */
export interface EficienciaInput {
  potenciaActualW: number;
  potenciaNuevaW: number;
  cantidad: number;
  horasDia: number;
  diasMes: number;
  /** Fracción del tiempo encendido a plena potencia [0-1]. */
  factorUso: number;
  /** Precio variable de la energía [$/kWh]. */
  precioKwh: number;
  /** Costo total de los equipos nuevos [$]. Opcional. */
  inversion?: number | null;
}

export interface EficienciaResult {
  consumoActualKwhMes: number;
  consumoNuevoKwhMes: number;
  ahorroKwhMes: number;
  ahorroKwhAnio: number;
  /** Ahorro relativo sobre el consumo de estos equipos [0-1]. Negativo si el nuevo consume más. */
  ahorroRelativo: number;
  ahorroPesosMes: number;
  ahorroPesosAnio: number;
  /** Meses para recuperar la inversión; null sin inversión o sin ahorro. */
  repagoMeses: number | null;
  /** Ahorro acumulado vs. inversión, mes a mes (hasta el repago o 24 meses, lo que sea mayor, máx. 120). */
  acumulado: { mes: number; ahorroAcumulado: number }[];
}

export function calcularEficiencia(i: EficienciaInput): EficienciaResult {
  for (const [k, v] of Object.entries({
    potenciaActualW: i.potenciaActualW,
    potenciaNuevaW: i.potenciaNuevaW,
    cantidad: i.cantidad,
    horasDia: i.horasDia,
    diasMes: i.diasMes,
    precioKwh: i.precioKwh,
  })) {
    if (!(Number.isFinite(v) && v > 0)) throw new RangeError(`${k} debe ser positivo (recibido: ${v})`);
  }
  if (!(i.factorUso > 0 && i.factorUso <= 1)) throw new RangeError(`factorUso debe estar en (0, 1]`);
  if (i.horasDia > 24) throw new RangeError("horasDia no puede superar 24");
  if (i.diasMes > 31) throw new RangeError("diasMes no puede superar 31");

  const kwhMes = (w: number) => (w * i.cantidad * i.horasDia * i.diasMes * i.factorUso) / 1000;
  const consumoActualKwhMes = kwhMes(i.potenciaActualW);
  const consumoNuevoKwhMes = kwhMes(i.potenciaNuevaW);
  const ahorroKwhMes = consumoActualKwhMes - consumoNuevoKwhMes;
  const ahorroPesosMes = ahorroKwhMes * i.precioKwh;

  const inversion = i.inversion ?? null;
  const repagoMeses = inversion != null && inversion > 0 && ahorroPesosMes > 0 ? inversion / ahorroPesosMes : null;

  const meses = Math.min(120, Math.max(24, Math.ceil(repagoMeses ?? 0)));
  const acumulado = Array.from({ length: meses + 1 }, (_, mes) => ({ mes, ahorroAcumulado: ahorroPesosMes * mes }));

  return {
    consumoActualKwhMes,
    consumoNuevoKwhMes,
    ahorroKwhMes,
    ahorroKwhAnio: ahorroKwhMes * 12,
    ahorroRelativo: ahorroKwhMes / consumoActualKwhMes,
    ahorroPesosMes,
    ahorroPesosAnio: ahorroPesosMes * 12,
    repagoMeses,
    acumulado,
  };
}
