/**
 * Dimensionamiento de un sistema fotovoltaico conectado a red.
 *
 * Modelo (balance ANUAL de energía):
 *   Energía objetivo [kWh/año] = consumo anual × cobertura
 *   Energía por kWp [kWh/kWp·año] = Σ_meses (HSP_mes × días_mes) × PR
 *   Potencia necesaria [kWp] = energía objetivo / energía por kWp
 *
 * Qué NO modela (se muestra como supuesto):
 *   - Que la energía se genere cuando se consume: el excedente se inyecta a la
 *     red y en invierno falta. El ahorro real depende del esquema de
 *     generación distribuida (autoconsumo vs. inyección).
 *   - Degradación de los paneles con los años.
 *   - Orientación, inclinación y sombras más allá de lo que resuma el PR.
 */

/** Días de cada mes en un año no bisiesto (suman 365). */
export const DIAS_POR_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;
export const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"] as const;

export interface SolarInput {
  /** Consumo mensual promedio [kWh/mes]. */
  consumoMensualKwh: number;
  /** Horas sol pico promedio anual [h/día]. Se ignora si hay HSP mensuales. */
  hspDiaria: number;
  /** Fracción del consumo anual a cubrir [0-1]. */
  cobertura: number;
  /** Performance ratio [0-1]. */
  performanceRatio: number;
  /** Potencia de un panel [Wp]. Opcional: si falta, no se calcula la cantidad. */
  potenciaPanelWp?: number | null;
  /** HSP de cada mes [h/día], 12 valores. Opcional. */
  hspMensual?: readonly number[] | null;
}

export interface MesSolar {
  mes: (typeof MESES)[number];
  dias: number;
  consumoKwh: number;
  generacionKwh: number;
}

export interface SolarResult {
  /** Potencia pico necesaria para la cobertura pedida [kWp]. */
  kwpNecesario: number;
  /** Con paneles enteros; null si no se indicó la potencia del panel. */
  paneles: { cantidad: number; kwpInstalado: number } | null;
  /** Potencia usada para estimar la generación: la instalada si hay paneles, si no la necesaria. */
  kwpEvaluado: number;
  consumoAnualKwh: number;
  generacionAnualKwh: number;
  /** Generación anual / consumo anual (puede superar 1 por redondeo de paneles). */
  coberturaResultante: number;
  /** Rendimiento específico [kWh/kWp·año]. */
  rendimientoEspecifico: number;
  /** HSP promedio anual efectivamente usada [h/día]. */
  hspPromedio: number;
  meses: MesSolar[];
}

export function dimensionarSolar(input: SolarInput): SolarResult {
  const { consumoMensualKwh, cobertura, performanceRatio: pr } = input;
  assertPositive("consumoMensualKwh", consumoMensualKwh);
  assertInRange("cobertura", cobertura, 0, 1);
  assertInRange("performanceRatio", pr, 0, 1);

  const hsp = input.hspMensual?.length === 12 ? [...input.hspMensual] : DIAS_POR_MES.map(() => input.hspDiaria);
  hsp.forEach((h, i) => assertPositive(`hsp[${i}]`, h));

  const consumoAnualKwh = consumoMensualKwh * 12;
  const hspDiasAnual = hsp.reduce((sum, h, i) => sum + h * DIAS_POR_MES[i]!, 0);
  const rendimientoEspecifico = hspDiasAnual * pr;
  const kwpNecesario = (consumoAnualKwh * cobertura) / rendimientoEspecifico;

  let paneles: SolarResult["paneles"] = null;
  if (input.potenciaPanelWp != null) {
    assertPositive("potenciaPanelWp", input.potenciaPanelWp);
    // Se redondea hacia arriba: con paneles enteros, nunca menos que lo necesario.
    const cantidad = Math.max(1, Math.ceil((kwpNecesario * 1000) / input.potenciaPanelWp - 1e-9));
    paneles = { cantidad, kwpInstalado: (cantidad * input.potenciaPanelWp) / 1000 };
  }

  const kwpEvaluado = paneles?.kwpInstalado ?? kwpNecesario;
  const meses: MesSolar[] = MESES.map((mes, i) => {
    const dias = DIAS_POR_MES[i]!;
    return {
      mes,
      dias,
      // El consumo promedio se reparte según los días de cada mes.
      consumoKwh: (consumoAnualKwh * dias) / 365,
      generacionKwh: kwpEvaluado * hsp[i]! * dias * pr,
    };
  });
  const generacionAnualKwh = meses.reduce((s, m) => s + m.generacionKwh, 0);

  return {
    kwpNecesario,
    paneles,
    kwpEvaluado,
    consumoAnualKwh,
    generacionAnualKwh,
    coberturaResultante: generacionAnualKwh / consumoAnualKwh,
    rendimientoEspecifico,
    hspPromedio: hspDiasAnual / 365,
    meses,
  };
}

function assertPositive(name: string, v: number) {
  if (!(Number.isFinite(v) && v > 0)) throw new RangeError(`${name} debe ser un número positivo (recibido: ${v})`);
}

function assertInRange(name: string, v: number, min: number, max: number) {
  if (!(Number.isFinite(v) && v > min && v <= max)) {
    throw new RangeError(`${name} debe estar en (${min}, ${max}] (recibido: ${v})`);
  }
}
