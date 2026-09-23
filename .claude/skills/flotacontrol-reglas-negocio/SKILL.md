---
name: flotacontrol-reglas-negocio
description: >
  Aplicar al tocar cualquier cálculo, agregación, hallazgo, corrección automática o vista nueva
  en este repo (FlotaControl / NEW-APP). Contiene las invariantes que ningún cambio puede violar,
  las decisiones ya cerradas con el usuario (que no se vuelven a discutir), las reglas de
  escapado XSS, y la deuda pendiente contra el repo hermano.
---

# Reglas de negocio — FlotaControl (repo NEW-APP)

> **Primero: confirmá en qué repo estás.** Hay dos repos FlotaControl y tres carpetas en disco.
> Este es el de la reescritura por fases (`flotacontrol-repo-limpio`, remote `NEW-APP.git`,
> deploy a GitHub Pages, IA con Ollama local). El hermano (`flotacontrol.git`, Vercel,
> `api/chat.js`) tiene **dos** clones en disco. Verificá con `git remote -v` antes de editar, y
> buscá en las tres carpetas antes de afirmar que algo "no existe": una sesión ya documentó como
> verdad que el modal de mapeo no existía, cuando estaba en este repo.

## 1. Las tres invariantes

### Invariante 1 — Mismo período de los dos lados de una razón

Un consumo divide litros por actividad: **los dos operandos vienen del mismo tramo de meses.**
Lo mismo para cualquier resta contra una meta.

`alinearCargasYGps()` (analyzer.js) intersecta los meses con cargas de cada equipo con sus meses
con GPS; la razón sale de ese subconjunto (`litros_alineados` / `km_alineados` / `horas_alineadas`).
Los totales del período quedan intactos: son gasto y actividad reales, y alimentan los KPIs.

**Trampa:** el campo `periodo` de un registro es el mes de su fecha de **inicio**. Un GPS Ene–Jul
lleva `periodo: '2026-01'` y mide siete meses. Para atribuir un registro a meses, `mesesDeRegistro(r)`.
`periodo` solo es seguro en cargas, que son puntuales.

**Caso vivo en este repo:** `calculateMetrics()` acumula `volumen_m3`, `dias_entrega` y `remitos`
de Loop **sin alinear períodos** (analyzer.js ~línea 530). Está bien mientras se muestren como
contexto. **No publicar ninguna razón con ese volumen** (L/m³, m³/día, $/m³) hasta que exista
`alinearCargasYEntregas()`: el período cargas∩GPS y el período cargas∩entregas casi nunca
coinciden. Medido en el hermano sobre MX97: alineado da 2,543 L/m³, sin alinear 2,962 — 16 % de
diferencia.

**Y el mes tiene que estar COMPLETO en las dos fuentes.** Que los meses coincidan no alcanza si
una de las dos cubre el mes a medias: `mesesCompletosDeFuente()` los saca del común antes de
dividir. Dos cosas que no son obvias:

- **La completitud es de la FUENTE, no del equipo.** Que un equipo no haya cargado la última
  semana es asunto suyo; lo que vuelve incompleto al mes es que la planilla entera se corte ahí.
  Se calcula una vez sobre todos los registros, no por equipo.
- **El corte es el último día HÁBIL.** Mayo 2026 termina domingo y su última carga es del sábado
  30: preguntar "¿hay dato el 31?" lo marcaría incompleto sin serlo.

Los meses recortados se publican (`totales.meses_incompletos` y
`alineacion.meses_incompletos_recortados`): un mes que desaparece del cálculo sin explicación es
peor que el problema que se está evitando.

**Lo que todavía NO está cubierto: la retro-carga.** Una carga de agosto ingresada en octubre
entra a agosto y nada avisa de que un mes ya analizado cambió de valor. Medido el 23/09/2026:
hoy no pasa (0 filas fuera de orden cronológico en 4.843). Para cubrirlo habría que guardar un
total por mes entre importaciones y comparar.

### Invariante 1b — Todo KPI de flota = Σ tarjetas + lo no asignado

Un registro que no matchea ningún equipo igual alimenta los totales: hay que acumularlo **entero**
(litros, km **y** horas), no solo sus litros.

Caso testigo: la unidad `PORTATIL` del GPS aporta 6.903 km y 3.180 h con **cero litros**. Si solo
se acumulan litros, es invisible en todos los hallazgos (que agrupan por litros) mientras el KPI
de km lee 6.903 de más, sin nada que explique la diferencia.

La otra mitad: lo que queda **fuera del período**. El período es la intersección, así que los
meses con cargas y sin GPS quedan afuera de los KPIs — correcto para la razón, invisible para
quien compara el panel contra la planilla. Hay que publicarlo, no esconderlo.

### Invariante 2 — Una definición por concepto

Estos viven en un solo lugar y se importan. **Nunca** se escribe una segunda versión:

| Concepto | Único dueño |
|---|---|
| Mediana | `mediana()` — diagnostico.js |
| Cobertura | `coberturaEquipo()` — diagnostico.js |
| Utilización | `utilizacion()` — diagnostico.js |
| Confiabilidad | `confiabilidad()` — diagnostico.js |
| Jornada de referencia | `JORNADA_REFERENCIA` — analyzer.js |
| Días hábiles | `diasHabiles()` — feriados.js |
| Clave de equipo | `normalizeEquipoKey()` — normalizer.js |
| Meses de un registro | `mesesDeRegistro()` — analyzer.js |
| ¿Tiene identificador? | `tieneIdentificador()` — datatable.js |
| Formato de un identificador | `clasificarIdentificador()` — normalizer.js |

Escribir una copia "porque es más rápido" ya produjo el mismo bug dos veces: la mediana inline
con `arr.sort()[Math.floor(n/2)]` devuelve el valor de arriba en una lista par, no el promedio de
los dos centrales.

### Invariante 3 — Un número bajo necesita contexto antes de ser conclusión

**Un TOTAL es un hecho; una TASA es una conclusión.** Toda métrica que es una razón (L/día,
$/carga, km/hora, L/m³) puede dar chico solo porque la base es floja.

Regla práctica: las métricas que son razones llevan `esTasa: true`. Si `confiabilidad()` dice que
la base no se sostiene, esa celda **queda fuera del cálculo de mejor/peor** y se muestra atenuada
con "⚠ base floja" y el motivo en el tooltip. Los totales no se marcan nunca: 71,6 L es cierto
aunque venga de una sola carga.

## 2. Decisiones cerradas — no volver a discutirlas

### Datos faltantes
- **INTERNO sin DOMINIO no es un error. DOMINIO sin INTERNO tampoco.** Nunca se marcan como
  advertencia ni se le pide al usuario que corrija.
- **Que falte un mes no es un error.** Se analiza la intersección de meses con datos en ambas
  fuentes, aunque sea uno solo, y **se declara cuál es**. Nunca se informa "falta el mes X".
- **Subir 3 meses o el año entero no es un error.**

### Fuentes
- **Los km de Loop nunca son denominador.** Medido: 110.858 km contra 215.658 del GPS en los
  mismos equipos y meses (51 %). Es distancia de viaje cargado, no recorrido total. Se descartó
  **esa columna**, no el archivo: el `Ciclo` del mismo archivo sí sirve.
- **Odómetro y horómetro de Wara están fuera de alcance.** Son acumulados de vida del equipo, no
  del período. Nunca se leen como "horas del mes".
- **`Volumen por camión` de Loop es solo control de totales**, no dato primario.
- Filas con km `---` o `0` en Wara son **sin medición**, no cero: salen del denominador.

### Autocorrección
- **Solo se autocorrigen códigos que aportan algo** (litros, km u horas > 0). Lo que aparece
  únicamente en Loop sin ninguna carga —`MAQUILA`, `GENCO`, nombres de cliente u obra— se descarta.
- **"Posible repetida" no es un hallazgo.** Dos cargas del mismo equipo, el mismo día, mismos
  litros pero distinto importe u hora **son legítimas** (dos surtidores, dos turnos). Solo el
  duplicado **exacto** se aparta, y eso ya se aplica solo.
- **Dar de alta un equipo nuevo es lo normal, no un aviso.**

### Entorno técnico
- **NUNCA agregar `"type": "module"` al `package.json`.** `xlsx.full.min.js` es UMD y los arneses
  lo cargan con `createRequire()`. Bajo `type: module` ese `require()` devuelve un objeto vacío,
  el parseo da 0 filas y la verificación mide **0 equipos en vez de 189, sin lanzar un error**.
- **Ningún CDN externo.** Font Awesome está vendorizado en `vendor/`. Si se suma Chart.js hay que
  vendorizar también `@kurkle/color`: el bundle `+esm` de jsDelivr lo importa **de la red en
  runtime** y rompe la app sin conexión.
- **No agregar bundler ni framework SPA.** La UI es imperativa por decisión.

## 3. Convención de escapado (XSS)

No hay módulo compartido. `const esc = (s) => ...` está duplicado **literal** al inicio de cada
archivo de UI que arma `innerHTML` con datos dinámicos. Al crear un archivo nuevo, copiar ese
mismo helper en vez de inventar otro.

Escapar **en el punto donde se interpola** el texto no confiable, no la plantilla entera: varios
lugares mezclan a propósito `<strong>`/`<code>` literales con datos escapados.

**El tropiezo recurrente está en `diagnostico.js`:** el `detalle` de cada hallazgo se renderiza
como HTML crudo a propósito. Cualquier texto libre venido de una planilla (nombre de combustible,
centro de costo, chofer) que se concatene ahí **tiene que** pasar por el `esc()` local del archivo.
Al agregar un hallazgo, buscar `detalle:` y revisar qué se interpola.

## 4. Deuda contra el repo hermano — qué falta portar

Medido el 23/09/2026. **Antes de portar cualquiera de estos, leer el plan en `CLAUDE.md`**: no
son copiar y pegar, las firmas divergieron.

| Qué | Riesgo | Por qué importa |
|---|---|---|
| `mesesCompletosDeFuente()` + `ultimoDiaHabilDelMes()` | **Alto** — cambia firmas de `alinearCargasYGps()` y `calculateMetrics()` | Una fuente que cubre el mes a medias entra al ratio: numerador de medio mes, denominador de uno entero |
| Vista Rendimiento (L/m³) | Medio — necesita `alinearCargasYEntregas()` + vendorizar Chart.js | Distingue "consume mucho" de "trabajó mucho" |

**Ya portado (23/09/2026):** `corregirCodigoConocido()` y `corregirCaloventorPorLugar()`
(normalizer.js), y `tieneIdentificador()` (datatable.js).

## 5. Lo que nunca se hace

- Prorratear actividad a meses sin medición.
- Dividir litros de un período por actividad de otro.
- Comparar dos equipos sobre períodos distintos sin decirlo.
- Cruzar equipos por igualdad de string en vez de `normalizeEquipoKey()`.
- Tratar un `---`, un `n/a` o un vacío como cero.
- Publicar un promedio de la flota sin decir cuántos equipos quedaron adentro y cuántos afuera.
- **Escribir en un comentario o en un cartel de la UI una afirmación sobre los datos que no se
  verificó corriendo los archivos. Si no se midió, no se afirma.**
