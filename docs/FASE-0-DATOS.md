# Fase 0 — Reconciliación de datos (18/09/2026)

Resumen público. El detalle por fila y por equipo está en un informe privado, fuera del repositorio, junto a la referencia de invariantes y a la planilla congelada.

## Resultado

| Arnés | Antes | Después |
|---|---|---|
| `npm run declarados` | OK (101) | OK (101) |
| `npm run auditar` | OK | OK (3.411 chequeos, 189 equipos) |
| `npm run verificar` | FALLA: +58 filas, +9.166,4 L, 178 equipos en vez de 189 | OK contra la referencia nueva |

## Causas

### 1. +58 filas / +9.166,4 L de Cargas: la planilla se actualizó

La referencia se generó el 11/09 y la planilla de Cargas se modificó el 14/09.

- Las 58 filas nuevas son exactamente las últimas 58 filas físicas de la hoja, con fechas del 10/09 al 15/09.
- Queda un residuo neto de 7,5 L (0,001 %). Corresponde a la corrección de una fila anterior, que no se puede identificar sin la versión del 11/09.
- El código del 11/09 corrido sobre la planilla actual mide los mismos números. La diferencia es de **datos**, no de cálculo.

### 2. 189 → 178 equipos: código agregado el 17/09 (bug, corregido)

Se encontraron y eliminaron tres bloques ajenos al proyecto.

| Archivo | Qué hacía | Efecto |
|---|---|---|
| `js/data/analyzer.js` (final de `analizarFlota`) | Filtraba equipos por prefijo, re-sumaba todas las tarjetas a los totales y escribía un "historial" en `localStorage` | 11 equipos ocultos, **KPIs de litros/km/horas inflados** y un historial que crecía en cada re-análisis |
| `js/ui/panel.js` (`datosParaSeguimiento`) | Regla "equipos sin ralentí" con la propiedad mal escrita (`Patrón` / `patrón`) | Excepción con cualquier equipo que no fuera CM: **la vista Seguimiento no abría** |
| `js/ui/panel.js` (`initPanelControls`) | Función `generarMD()` insertada en medio de otra función | Código muerto |

Los demás cambios del 16–17/09 se revisaron y se conservan:

- período automático anclado en Cargas;
- contexto Loop por equipo;
- "Resumen de viaje" como comparativa;
- acciones de hallazgos;
- exportación de revisión;
- IA con Ollama.

### 3. Cambios de dataset que no son errores

- **GPS: +5 filas.** Son "Resumen de viaje" nuevos, importados como comparativa. No suman km ni horas.
- **Duplicados exactos: 3 → 10.** Una carga duplicada más y copias repetidas del mismo "Resumen de viaje".
- **Hallazgos: 20 → 21.** Se suma la comparativa del Resumen de viaje contra el Resumen de Flota.

## Por qué ningún arnés vio el bug de los totales

`verificar` medía las cargas crudas y la cantidad de equipos, pero no los **KPIs que muestra el panel**. Se agregó en `tools/verificar-datos-reales.mjs`:

- **Control de coherencia, sin necesitar referencia.** El KPI de litros no puede superar el total de cargas, y la suma de las tarjetas no puede superar el KPI. Corre **antes** de `--actualizar`, así un total inflado nunca queda congelado como esperado.
- **KPIs del panel en la referencia:** litros, km, horas y equipos sobre meta, con tolerancia.

Se probó que el control detecta el bug corriéndolo sobre el código del commit `dd6a93f`, que todavía lo tenía.

## Regla para la próxima planilla

Antes de `npm run verificar:actualizar`:

1. Guardar una copia fechada de la planilla anterior junto a la referencia privada.
2. Compararlas fila por fila.
3. Actualizar solo si la diferencia queda explicada.
