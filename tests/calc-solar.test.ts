import { describe, expect, it } from "vitest";
import { checkField, type FieldSpec } from "../src/calc/fields";
import { formatNumber, parseDecimal } from "../src/calc/number";
import { DIAS_POR_MES, dimensionarSolar } from "../src/calc/solar";

// Valores de PRUEBA para verificar la aritmética; no son datos del sector.
const base = { consumoMensualKwh: 300, hspDiaria: 5, cobertura: 1, performanceRatio: 0.8 };

describe("dimensionarSolar", () => {
  it("potencia necesaria = energía anual / (HSP × PR × 365)", () => {
    const r = dimensionarSolar(base);
    // 3600 kWh/año / (5 × 0,8 × 365 = 1460 kWh/kWp·año)
    expect(r.consumoAnualKwh).toBe(3600);
    expect(r.rendimientoEspecifico).toBeCloseTo(1460, 9);
    expect(r.kwpNecesario).toBeCloseTo(3600 / 1460, 9);
    expect(r.generacionAnualKwh).toBeCloseTo(3600, 6);
    expect(r.coberturaResultante).toBeCloseTo(1, 9);
    expect(r.paneles).toBeNull();
  });

  it("la cobertura escala la potencia linealmente", () => {
    const full = dimensionarSolar(base).kwpNecesario;
    const half = dimensionarSolar({ ...base, cobertura: 0.5 }).kwpNecesario;
    expect(half).toBeCloseTo(full / 2, 9);
  });

  it("con paneles enteros redondea hacia arriba y recalcula la generación", () => {
    const r = dimensionarSolar({ ...base, potenciaPanelWp: 450 });
    // 2465,75 Wp / 450 = 5,48 → 6 paneles = 2,7 kWp
    expect(r.paneles).toEqual({ cantidad: 6, kwpInstalado: 2.7 });
    expect(r.kwpEvaluado).toBe(2.7);
    expect(r.generacionAnualKwh).toBeCloseTo(2.7 * 1460, 6);
    expect(r.coberturaResultante).toBeGreaterThan(1);
  });

  it("si la potencia es múltiplo exacto no suma un panel de más", () => {
    // 3650 kWh/año con 1460 kWh/kWp → 2,5 kWp exactos = 5 paneles de 500 Wp
    const r = dimensionarSolar({ ...base, consumoMensualKwh: 3650 / 12, potenciaPanelWp: 500 });
    expect(r.paneles?.cantidad).toBe(5);
  });

  it("los meses suman el total y respetan los días", () => {
    const r = dimensionarSolar(base);
    const consumo = r.meses.reduce((s, m) => s + m.consumoKwh, 0);
    const gen = r.meses.reduce((s, m) => s + m.generacionKwh, 0);
    expect(consumo).toBeCloseTo(3600, 9);
    expect(gen).toBeCloseTo(r.generacionAnualKwh, 9);
    expect(r.meses[1]!.dias).toBe(28);
    expect(DIAS_POR_MES.reduce((a, b) => a + b, 0)).toBe(365);
  });

  it("con HSP mensuales usa el promedio ponderado por días", () => {
    const hspMensual = [7, 6.5, 5.5, 4.5, 3.5, 3, 3.2, 4, 5, 6, 6.8, 7.2];
    const r = dimensionarSolar({ ...base, hspDiaria: 999, hspMensual });
    const hspDias = hspMensual.reduce((s, h, i) => s + h * DIAS_POR_MES[i]!, 0);
    expect(r.hspPromedio).toBeCloseTo(hspDias / 365, 9);
    expect(r.kwpNecesario).toBeCloseTo(3600 / (hspDias * 0.8), 9);
    // Enero genera más que junio.
    expect(r.meses[0]!.generacionKwh).toBeGreaterThan(r.meses[5]!.generacionKwh);
    expect(r.generacionAnualKwh).toBeCloseTo(3600, 6);
  });

  it("rechaza entradas imposibles", () => {
    expect(() => dimensionarSolar({ ...base, performanceRatio: 0 })).toThrow(RangeError);
    expect(() => dimensionarSolar({ ...base, performanceRatio: 1.2 })).toThrow(RangeError);
    expect(() => dimensionarSolar({ ...base, cobertura: 0 })).toThrow(RangeError);
    expect(() => dimensionarSolar({ ...base, hspDiaria: 0 })).toThrow(RangeError);
    expect(() => dimensionarSolar({ ...base, consumoMensualKwh: -1 })).toThrow(RangeError);
  });
});

describe("parseDecimal", () => {
  it.each([
    ["4,5", 4.5],
    ["4.5", 4.5],
    ["1.200", 1200],
    ["1.200,5", 1200.5],
    ["12.500.000", 12500000],
    [" 350 ", 350],
    ["0,85", 0.85],
  ])("%s → %s", (raw, n) => expect(parseDecimal(raw)).toBe(n));
  it.each(["", "abc", "4,5,6", "1..2", "5 kWh"])("%s → null", (raw) => expect(parseDecimal(raw)).toBeNull());
});

describe("checkField", () => {
  const spec: FieldSpec = { id: "p", label: "Potencia", unit: "kW", min: 1, max: 500, subject: "La potencia", decimals: 0 };
  it("mensaje que dice qué está mal y cómo corregirlo", () => {
    expect(checkField(spec, "900", true).error).toBe("La potencia debe estar entre 1 y 500 kW.");
    expect(checkField(spec, "abc", true).error).toMatch(/^Ingresá solo un número/);
    expect(checkField(spec, "", true).error).toBe("Completá este dato (kW).");
  });
  it("concuerda en plural", () => {
    const hsp: FieldSpec = { ...spec, unit: "h/día", min: 0.5, max: 9, decimals: 1, subject: "Las horas sol pico", plural: true };
    expect(checkField(hsp, "12", true).error).toBe("Las horas sol pico deben estar entre 0,5 y 9 h/día.");
  });
  it("vacío opcional no es error", () => {
    expect(checkField(spec, "", false)).toEqual({ value: null, error: null });
  });
  it("acepta coma decimal", () => {
    expect(checkField(spec, "12,5", true)).toEqual({ value: 12.5, error: null });
  });
  it("formatea en es-AR", () => {
    expect(formatNumber(1234.567, 2)).toBe("1.234,57");
  });
});
