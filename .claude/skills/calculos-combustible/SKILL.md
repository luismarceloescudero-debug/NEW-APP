---
name: calculos-combustible
description: Reglas de cálculo de consumo de combustible de FlotaControl (repo NEW-APP). Usar SIEMPRE antes de escribir, cambiar o revisar código que calcule, agregue, promedie o compare litros, kilómetros, horas, m³, consumos, metas, desvíos o costos — y antes de agregar una métrica nueva o una regla de diagnóstico. También al interpretar un número que la app ya muestra, o al responder "¿por qué da esto?". No usar para cambios de estilo, texto o layout que no toquen una cifra.
---

# Cálculos de combustible — reglas que no se negocian

Un cálculo mal hecho igual corre e igual imprime un número creíble. Por eso estas reglas no se
razonan de nuevo cada vez: se aplican.

## 1. Período común, siempre

Toda razón (consumo, rendimiento, desvío) divide una cantidad por una actividad. **Las dos partes
tienen que venir de los mismos meses.**

- El período de un equipo es la **intersección** de los meses que tiene en cada fuente que
  interviene en ese cálculo. No la unión, no el máximo, no "lo que haya".
- Si una fuente cubre meses que la otra no, esos meses **salen del cálculo**, no se prorratean.
  Prorratear inventa actividad que nadie midió.
- Un reporte multi-mes entra **entero o no entra**.
- `alinearCargasYGps()` (analyzer.js) ya hace esto. Cualquier métrica nueva pasa por ahí o
  replica la regla.

**No se le informa al usuario "falta el mes X".** Se calcula sobre el período común y se
**declara cuál es**: "consumo de mar–jun (4 meses comunes entre cargas y GPS)".

**Trampa:** `periodo` es solo el mes de la fecha de inicio. Un GPS Ene–Jul lleva `'2026-01'` y
mide siete meses. Usar `mesesDeRegistro(r)`.

**Pendiente en este repo:** no existe `mesesCompletosDeFuente()`. Una fuente cortada a mitad de
mes (cargas hasta el día 14, GPS cubriendo el mes entero) produce un ratio con numerador de medio
mes y denominador de uno completo — plausible y mal por casi la mitad. Ver la deuda en `CLAUDE.md`.

## 2. Todo número que es un resultado muestra sus pasos

Si una cifra salió de una operación, el usuario tiene que poder abrirla y ver:

1. **La fórmula** con nombres, no símbolos: `litros ÷ km × 100`.
2. **Los valores que entraron**, con unidades: `1.494 L ÷ 1.575 km × 100`.
3. **El período** del que salieron.
4. **El origen**: qué archivo y, si se puede, qué fila.

La fórmula mostrada tiene que **dar exactamente** el número que está al lado. Si no cierra, el
bug está en el cálculo, no en el cartel. El patrón vive en `js/ui/calcpopover.js`.

**Un número sin pasos visibles no se publica en la UI.**

## 3. Qué se le puede pedir a cada fuente

| Fuente | Sirve para | **No** sirve para |
|---|---|---|
| `Cargas_Combustible_*.xlsx` | litros, costo, precio, chofer, lugar, centro de costo | actividad |
| `Resumen de Flota` (Wara) | km recorridos, horas de ralentí y movimiento | litros (la columna viene `n/a`) |
| `Consumos Estimados` | la meta **y la unidad** (L/hora vs L/100km) | consumo real |
| `Equipos HSV` | interno, dominio, marca, modelo | el campo `TIPO` (le dice "CAMION" a un tractor) |
| Loop `Informe Entregas` | m³, nº de entregas, planta, obra, ciclo | **kilómetros** |
| Loop `Volumen por camión` | **control de totales** contra el detalle | dato primario (es un agregado) |

**Los km de Loop no se usan nunca como denominador.** Medido: 110.858 km contra 215.658 del GPS
en los mismos equipos y meses (51 %). Es distancia de viaje cargado. Usarla duplicaría el consumo
de toda la flota.

**Horómetro y odómetro** (Wara, desde julio 2026) son **acumulados de vida del equipo** — hay
equipos con 1.343 días de horómetro. Nunca son "horas del mes".

Filas con km `---` o `0` son **sin medición**, no cero: salen del denominador en vez de hundir
el promedio.

## 4. Las unidades y cuándo usar cada una

- **L/100km** — para lo que se mueve. Variación mes a mes medida: 13 %.
- **L/hora** — para lo que trabaja parado (bombas, generadores, caloventores). La unidad la
  declara "Consumos Estimados"; el prefijo del interno es solo el fallback.
- **L/m³** — solo mixers, solo con entregas del mismo período. Variación medida: 18 %. Es
  **contexto**, no reemplazo: distingue "consume mucho" de "trabajó mucho".
  **En este repo todavía NO se puede publicar** (ver invariante 1 en la skill de reglas de
  negocio): `calculateMetrics()` acumula `volumen_m3` sin alinear períodos.

Cuando existen los dos denominadores se exponen las dos: `consumo_l_hora` y `consumo_l_100km`.
`consumo_real` es la de la unidad declarada del equipo.

Una razón sobre **menos de un mes común** o con cobertura baja se marca como no representativa.
Un número flojo con una etiqueta honesta es útil; sin la etiqueta, miente.

## 5. Números verificados de ESTE repo

Corridos el **23/09/2026** con `npm run verificar` sobre los Excel reales, y congelados en
`tools/invariantes.json` — que **está gitignoreado a propósito** (son cifras reales de la flota;
ver `CLAUDE.md`). Si tu clon no lo tiene, generalo con `npm run verificar:actualizar`.

Si un cambio mueve estos números sin que se haya tocado esa lógica a propósito, hay un bug:

```
Equipos maestro    189            Equipos analizados     84
Cargas             4.843 filas · 745.289 L · 0 sin fecha · 0 sin litros
GPS                912 filas equipo-mes · 120 unidades ene–jun y ago · 67 en julio
Loop               7.037 registros finales · 55.364,5 m³ · 6 remitos en conflicto
Duplicados exactos 6 (apartados a propósito, no borrados)
Panel              2026-01-01 → 2026-08-31 · 678.429,5 L · 1.278.888,9 km · 83.189,2 hs
                   36 equipos sobre la meta · 21 hallazgos
Autocorrección     6 altas de interno · 2 metas alineadas · 0 aceptados · 14 huérfanos
```

Los últimos dos valores se movieron el 23/09 al portar `corregirCodigoConocido()` y
`corregirCaloventorPorLugar()` (antes: 1 aceptado, 16 huérfanos, 23 hallazgos). Fue un cambio
**intencional y medido**, con el mismo delta exacto que en el repo hermano. Los litros, km y
horas no se movieron: reasignar un código cambia a qué equipo van los litros, no cuántos entran.

**Pendiente de explicar (no asumir que está bien):** el repo hermano, con los mismos archivos,
informa **189 equipos analizados** contra los **84** de acá. Puede ser una diferencia de
definición (qué cuenta como "analizado") o un filtro que descarta equipos de más. **Medirlo antes
de tocar nada**, y no citar ninguno de los dos números como correcto hasta entender la diferencia.

## 6. Lo que nunca se hace

- Prorratear actividad a meses sin medición.
- Dividir litros de un período por actividad de otro.
- Comparar dos equipos sobre períodos distintos sin decirlo.
- Cruzar equipos por igualdad de string en vez de `normalizeEquipoKey()`.
- Tratar un `---`, un `n/a` o un vacío como cero.
- Publicar un promedio de flota sin decir cuántos equipos quedaron adentro y cuántos afuera.
- **Afirmar algo sobre los datos sin haberlo corrido. Si no se midió, no se afirma.**
