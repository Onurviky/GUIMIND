import { describe, expect, it } from "vitest";
import { calcularEficiencia } from "../src/calc/eficiencia";
import { calcularRoi, tir } from "../src/calc/roi";
import { costoEnergia, costoTarifa, puntosDeCambio, type Tarifa } from "../src/calc/tarifas";

// Todos los montos son de PRUEBA para verificar la aritmética; no son datos del sector.

describe("calcularEficiencia", () => {
  const base = {
    potenciaActualW: 60,
    potenciaNuevaW: 9,
    cantidad: 10,
    horasDia: 5,
    diasMes: 30,
    factorUso: 1,
    precioKwh: 100,
  };

  it("kWh = W × cantidad × h × días × factor / 1000", () => {
    const r = calcularEficiencia(base);
    expect(r.consumoActualKwhMes).toBeCloseTo(90, 9); // 60×10×5×30/1000
    expect(r.consumoNuevoKwhMes).toBeCloseTo(13.5, 9);
    expect(r.ahorroKwhMes).toBeCloseTo(76.5, 9);
    expect(r.ahorroKwhAnio).toBeCloseTo(918, 9);
    expect(r.ahorroRelativo).toBeCloseTo(0.85, 9);
    expect(r.ahorroPesosMes).toBeCloseTo(7650, 9);
    expect(r.repagoMeses).toBeNull();
  });

  it("el factor de uso reduce ambos consumos en la misma proporción", () => {
    const r = calcularEficiencia({ ...base, factorUso: 0.4 });
    expect(r.ahorroKwhMes).toBeCloseTo(76.5 * 0.4, 9);
    expect(r.ahorroRelativo).toBeCloseTo(0.85, 9);
  });

  it("repago simple = inversión / ahorro mensual", () => {
    const r = calcularEficiencia({ ...base, inversion: 38250 });
    expect(r.repagoMeses).toBeCloseTo(5, 9);
    expect(r.acumulado).toHaveLength(25); // mínimo 24 meses + el mes 0
    expect(r.acumulado[5]!.ahorroAcumulado).toBeCloseTo(38250, 6);
  });

  it("si el equipo nuevo consume más, el ahorro es negativo y no hay repago", () => {
    const r = calcularEficiencia({ ...base, potenciaNuevaW: 80, inversion: 1000 });
    expect(r.ahorroKwhMes).toBeLessThan(0);
    expect(r.repagoMeses).toBeNull();
  });

  it("rechaza entradas imposibles", () => {
    expect(() => calcularEficiencia({ ...base, horasDia: 25 })).toThrow(RangeError);
    expect(() => calcularEficiencia({ ...base, factorUso: 0 })).toThrow(RangeError);
    expect(() => calcularEficiencia({ ...base, precioKwh: 0 })).toThrow(RangeError);
  });
});

describe("tarifas", () => {
  const escalonada: Tarifa = {
    nombre: "A",
    cargoFijo: 1000,
    escalones: [
      { desdeKwh: 0, precio: 10 },
      { desdeKwh: 150, precio: 20 },
    ],
    modo: "escalonado",
    cargoPotencia: 0,
    impuestos: 0,
  };
  const categoria: Tarifa = { ...escalonada, nombre: "B", modo: "categoria" };

  it("escalonado: cada tramo a su precio", () => {
    expect(costoEnergia(escalonada, 100)).toBe(1000);
    expect(costoEnergia(escalonada, 200)).toBe(150 * 10 + 50 * 20);
  });

  it("categoría: todo el consumo al precio del escalón alcanzado", () => {
    expect(costoEnergia(categoria, 149)).toBe(1490);
    expect(costoEnergia(categoria, 150)).toBe(3000); // salto al pasar el límite
    expect(costoEnergia(categoria, 200)).toBe(4000);
  });

  it("total = (fijo + energía + potencia) × (1 + impuestos)", () => {
    const t: Tarifa = { ...escalonada, cargoPotencia: 50, impuestos: 0.21 };
    const c = costoTarifa(t, 100, 10);
    expect(c.fijo).toBe(1000);
    expect(c.energia).toBe(1000);
    expect(c.potencia).toBe(500);
    expect(c.impuestos).toBeCloseTo(2500 * 0.21, 9);
    expect(c.total).toBeCloseTo(2500 * 1.21, 9);
    expect(c.precioMedio).toBeCloseTo((2500 * 1.21) / 100, 9);
  });

  it("consumo 0: solo cargos fijos", () => {
    expect(costoTarifa(escalonada, 0).total).toBe(1000);
    expect(costoTarifa(escalonada, 0).precioMedio).toBe(0);
  });

  it("detecta dónde cambia la tarifa más barata", () => {
    // A: fijo alto y energía barata. B: sin fijo y energía cara. Se cruzan en 100 kWh.
    const a: Tarifa = { nombre: "A", cargoFijo: 1000, escalones: [{ desdeKwh: 0, precio: 10 }], modo: "escalonado", cargoPotencia: 0, impuestos: 0 };
    const b: Tarifa = { ...a, nombre: "B", cargoFijo: 0, escalones: [{ desdeKwh: 0, precio: 20 }] };
    expect(puntosDeCambio(a, b, 300)).toEqual([101]);
  });

  it("valida escalones", () => {
    expect(() => costoTarifa({ ...escalonada, escalones: [{ desdeKwh: 10, precio: 1 }] }, 5)).toThrow(/empezar en 0/);
    expect(() =>
      costoTarifa({ ...escalonada, escalones: [{ desdeKwh: 0, precio: 1 }, { desdeKwh: 0, precio: 2 }] }, 5),
    ).toThrow(/creciente/);
  });
});

describe("calcularRoi", () => {
  const base = {
    inversionUsd: 5000,
    generacionAnualKwh: 5000,
    autoconsumo: 1,
    precioCompra: 100, // $/kWh
    precioInyeccion: 0,
    tipoCambio: 1000, // $/USD → 0,1 USD/kWh
    mantenimientoUsdAnio: 0,
    degradacionAnual: 0,
    variacionPrecioAnual: 0,
    horizonteAnios: 20,
  };

  it("todo en USD: ahorro = generación × precio / tipo de cambio", () => {
    const r = calcularRoi(base);
    expect(r.ahorroAnio1Usd).toBeCloseTo(500, 9);
    expect(r.repagoAnios).toBeCloseTo(10, 9);
    expect(r.gananciaNetaUsd).toBeCloseTo(5000, 6);
    expect(r.vanUsd).toBeNull();
  });

  it("la energía inyectada vale el precio de inyección", () => {
    const r = calcularRoi({ ...base, autoconsumo: 0.6, precioInyeccion: 50 });
    // 5000 × (0,6 × 0,1 + 0,4 × 0,05) = 400 USD
    expect(r.ahorroAnio1Usd).toBeCloseTo(400, 9);
  });

  it("degradación y mantenimiento reducen el ahorro año a año", () => {
    const r = calcularRoi({ ...base, degradacionAnual: 0.01, mantenimientoUsdAnio: 20 });
    expect(r.anios[0]!.ahorroUsd).toBeCloseTo(480, 9);
    expect(r.anios[1]!.generacionKwh).toBeCloseTo(4950, 9);
    expect(r.anios[1]!.ahorroUsd).toBeCloseTo(4950 * 0.1 - 20, 9);
  });

  it("si no se recupera dentro del horizonte, repago es null", () => {
    const r = calcularRoi({ ...base, horizonteAnios: 5 });
    expect(r.repagoAnios).toBeNull();
    expect(r.gananciaNetaUsd).toBeCloseTo(-2500, 6);
  });

  it("VAN con tasa de descuento y TIR consistente (VAN(TIR) = 0)", () => {
    const r = calcularRoi({ ...base, tasaDescuento: 0.08 });
    const flujos = r.anios.map((a) => a.ahorroUsd);
    const esperado = -5000 + flujos.reduce((s, f, k) => s + f / 1.08 ** (k + 1), 0);
    expect(r.vanUsd).toBeCloseTo(esperado, 6);
    expect(r.tir).not.toBeNull();
    const vanEnTir = -5000 + flujos.reduce((s, f, k) => s + f / (1 + r.tir!) ** (k + 1), 0);
    expect(Math.abs(vanEnTir)).toBeLessThan(1e-4);
  });

  it("TIR de un caso conocido: invertir 100 y recibir 110 al año = 10 %", () => {
    expect(tir(100, [110])).toBeCloseTo(0.1, 6);
  });

  it("rechaza entradas imposibles", () => {
    expect(() => calcularRoi({ ...base, autoconsumo: 1.2 })).toThrow(RangeError);
    expect(() => calcularRoi({ ...base, tipoCambio: 0 })).toThrow(RangeError);
    expect(() => calcularRoi({ ...base, horizonteAnios: 2.5 })).toThrow(RangeError);
  });
});
