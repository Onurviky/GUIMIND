---
publish: true
tags: [conceptos, solar, recurso-solar]
---

Las **horas sol pico** (HSP) expresan la irradiación diaria de un lugar como la cantidad de horas equivalentes a una irradiancia de 1 kW/m².

> [!info] Depende del lugar y la época
> Varían mucho según la latitud, el clima y el mes. Un único valor "para todo el país" es una simplificación grosera.

## Uso en el dimensionamiento

La energía diaria estimada de un sistema es:

$$E_{día} = P_{pico} \cdot HSP \cdot PR$$

donde $P_{pico}$ está en kWp, $HSP$ en horas y $PR$ es el [[Performance ratio]] (adimensional).

## Fuentes de datos

Los valores de HSP tienen que salir de una base de irradiación reconocida para la ubicación concreta. #pendiente

```dataview
TABLE fuente FROM #recurso-solar
```
