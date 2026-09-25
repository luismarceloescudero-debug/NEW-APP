# CLAUDE.md

Guía para Claude Code en este repositorio.

> **Este archivo se escribió el 23/09/2026 portando el conocimiento del repo hermano.** Todo lo
> que dice sobre ESTE repo está verificado contra su código; lo que todavía no se verificó está
> marcado como tal. No agregar afirmaciones sobre los datos sin correr los archivos: la regla del
> proyecto es "si no se midió, no se afirma".

## Qué es esto, y en qué se diferencia del otro repo

FlotaControl: panel de consumo de combustible de la flota de HSV Logística. Corre **100 % en el
navegador** (módulos ES, sin build, sin framework): las planillas Excel se parsean del lado del
cliente y los datos viven en IndexedDB. **Ningún dato de la flota sale de la computadora.**

**Hay DOS repositorios FlotaControl y es imprescindible saber en cuál se está trabajando:**

| | **Este repo** (`NEW-APP`) | El hermano (`flotacontrol`) |
|---|---|---|
| Carpeta | `NO TOCAR/NEW APP/flotacontrol-repo-limpio` | `NO TOCAR/CONSUMO DE COMBUSTIBLE/flotacontrol-repo/repo` |
| Origen | Reescritura por fases (Fase 0 → 7) | Línea principal, 76 commits |
| Deploy | **GitHub Pages** (`.github/workflows/pages.yml`) | **Vercel** |
| IA | **Ollama local**, sin backend ni API key | Backend propio `api/chat.js` con la clave de Anthropic |

Los Excel reales viven en `NO TOCAR/NEW APP/ARCHIVOS/` (fuera de todo repo, nunca versionados).

**Hasta el 23/09/2026 hubo un tercer directorio**, `NEW APP/CONSUMO DE COMBUSTIBLE/flotacontrol-repo/repo`,
que era un **segundo clon del repo hermano**. Ya no está, y eso es una buena noticia: esa
duplicación causó dos fallas reales, ninguna evidente. Una sesión grepeó en el clon equivocado y
dejó escrito como verdad, en la documentación del hermano, que el modal de mapeo de columnas
"nunca se integró" — existe, es `js/ui/mapeo.js`, y está en **este** repo. Y un `preview_start`
levantó el proyecto equivocado, con la app cargando bien y sin reflejar ningún cambio.

La lección queda aunque el tercer directorio ya no exista: **antes de concluir que algo "no
existe en el código", confirmá en qué repo estás** (`git remote -v`) y buscá en los dos.

## Lo que este repo tiene y el hermano no

Son las razones por las que esta bifurcación vale la pena:

1. **IA local con Ollama** (`js/ai/ollama.js`). El navegador le habla directo a Ollama
   (`http://127.0.0.1:11434`). No hay backend, no hay API key en el frontend, no hay costo por
   request. Reemplaza al `/api/chat` del hermano, que tiene documentada como deuda la falta de
   rate limiting y un secreto compartido que viaja en el JS. Para publicar el sitio fuera de
   localhost hace falta `OLLAMA_ORIGINS` (ver `docs/DEPLOYMENT.md`). No hay búsqueda web: un
   modelo local no sale a internet solo, y agregarla implicaría el backend que esta fase evita.
2. **Importación flexible** (`js/parsers/esquemas.js` + `js/ui/mapeo.js`). Cuando un archivo no
   coincide exacto con un formato conocido, se puntúa contra cada esquema y se abre la vista
   previa "Revisar columnas antes de importar", que muestra qué entendió la app de cada columna
   y deja corregirlo **antes** de combinar nada. Incluye detección de superposición: caso real,
   el reporte de la estación GRIS repetía cargas de la planilla global; si se superpone, por
   defecto se guarda aparte y **no suma litros**.
3. **Backup y restauración** (`js/ui/backup.js`).
4. **PWA instalable y sin conexión**: `manifest.webmanifest`, `sw.js`, CSP, y Font Awesome
   vendorizado en `vendor/` — sin ningún CDN externo.
5. **CI de verdad** (`.github/workflows/ci.yml`) y `package.json` con licencia MIT, scripts y
   dependencias declaradas.

## Lo que el hermano tiene y este repo NO — deuda conocida

Medido el 23/09/2026 comparando ambos árboles. Está en orden de gravedad:

1. **Vista Rendimiento (L/m³ por mixer)**. Acá `calculateMetrics()` ya acumula
   `volumen_m3`, `dias_entrega` y `remitos` de Loop (línea 530), pero **sin alinear períodos**, y
   no existe `alinearCargasYEntregas()`. Está bien que hoy no se publique ninguna razón con ese
   volumen: sería violar la invariante 1. Para portar la vista hace falta, en este orden:
   (a) `alinearCargasYEntregas()`, (b) el umbral `MIN_ENTREGAS_L_M3 = 10` —medido, no elegido: de
   26 mixers con L/m³ calculable, 24 caen entre 2,54 y 5,74— y (c) **vendorizar Chart.js**, que
   este repo no tiene. Ojo con la trampa ya documentada en el hermano: el bundle `+esm` de
   jsDelivr importa `@kurkle/color` **de la red en runtime**, lo que rompería la app sin internet;
   hay que vendorizar también esa dependencia y reescribir el import a la ruta local.

### Ya portado el 23/09/2026 — no volver a plantearlo como deuda

- **`corregirCodigoConocido()` y `corregirCaloventorPorLugar()`** más **`tieneIdentificador()`**.
  El delta medido fue **idéntico** al que produjeron en el hermano sobre los mismos archivos:
  códigos aceptados automáticamente 1 → 0, huérfanos a revisión manual 16 → 14, hallazgos 23 → 21.
  Los totales de litros, km y horas **no se movieron**: reasignar un código cambia a qué equipo
  van los litros, no cuántos entran.
- **`mesesCompletosDeFuente()` + `ultimoDiaHabilDelMes()`**. Ver "Un mes cubierto a medias" abajo.
  Con los datos actuales **no movió ningún número** —septiembre todavía no tiene GPS, así que no
  entraba a ninguna intersección— y esa es exactamente la señal de que es una protección latente,
  no un cambio de criterio.

Lo que **no** es deuda, aunque lo parezca: que no haya `tools/invariantes.json` versionado. Es
deliberado — ver arriba.

## Comandos

No hay build. Desarrollo:

```bash
npm run dev
```

(`tools/servidor-local.cjs`, puerto 8080 o el que diga `PORT`). Abrir `index.html` directo
(`file://`) **no funciona**: el navegador bloquea los módulos ES por CORS sin servidor.

Desde Claude Code, la preview de este repo se llama **`limpio`** (`preview_start` con
`name: "limpio"`). **Nunca pedirla como `flotacontrol`**: ese nombre matchea por aproximación con
las configs del repo hermano y levanta el proyecto equivocado — la app carga bien y no refleja
ningún cambio, que es el síntoma más confuso posible.

### Verificar un cambio

```bash
npm run probar      # unit tests + los cinco arneses, en orden de velocidad
```

Correrlo **antes de commitear** cualquier cosa en `js/data/` o `js/parsers/`. Los seis:

| Comando | Qué pregunta | Velocidad |
|---|---|---|
| `npm test` | ¿Cada función pura sigue cumpliendo el contrato que tiene escrito? | ~5 s |
| `npm run declarados` | ¿Las funciones puras siguen dando lo mismo? Sin Excel, sin IndexedDB. | instantáneo |
| `npm run importacion` | ¿La Fase 7 sigue reconociendo planillas inventadas? | rápido |
| `npm run unidades` | ¿Los dos lados de cada cruce están en la misma unidad y formato? | minutos |
| `npm run verificar` | ¿Los totales siguen coincidiendo con `tools/invariantes.json`? | minutos |
| `npm run auditar` | ¿Cada número se puede re-derivar de su propia definición? | minutos |

**`npm test` — la suite de unit tests (`tests/*.test.mjs`, node:test, sin dependencias).**
273 casos sobre las funciones puras de `js/data/` y `js/parsers/`. No reemplaza a ningún arnés
y ninguno lo reemplaza a él: los arneses corren el pipeline entero sobre los Excel reales y
contestan *"¿el total cambió?"*; los tests fijan el **contrato de cada función por separado** y
contestan *"¿esta pieza sigue haciendo lo que dice que hace?"* — sin planillas, en segundos, y
apuntando al renglón exacto cuando algo se rompe. (Los ~4 s los gasta casi enteros
`feriados-zona-horaria.test.mjs`, que levanta un proceso de Node por zona; el resto corre en
menos de medio segundo.)

Cada caso está escrito desde la especificación (los comentarios del código y este archivo), no
desde releer la implementación. Esa es la regla que los hace valer: un test derivado del código
solo confirma que el código hace lo que hace. Cubren, entre otros, todos los bugs que ya
ocurrieron y están documentados acá: `"9.5"` leído como 95, `"07:30"` leído como 7,
`"3 days, 10:53:03"` leído como 10:53, `"1/1/2026, 0:00"` guardado como `"2026,-01-01"`,
`"MX-108-VL"` clasificado como patente, `"OXZ 911"` partido en dos, la mediana de una lista par
devolviendo el de arriba, y el GPS Ene–Jul contado como un solo mes de enero.

Al agregar una función pura nueva a `js/data/` o `js/parsers/`, el test va en el mismo commit.

**Qué corre en CI y qué no — el desbalance que hay que vigilar.** De los seis comandos, solo
tres corren sin los Excel reales y por lo tanto en CI: `npm test`, `declarados` e `importacion`.
`unidades`, `verificar` y `auditar` necesitan las planillas, que viven fuera del repo a
propósito. Un mutation testing del 24/09/2026 (87 mutaciones sobre los siete módulos, 51
muertas) encontró la consecuencia: **las tres invariantes, en los dos lugares donde se aplican
de verdad —`calculateMetrics()` y `calcularExceso()`—, estaban protegidas únicamente por
`auditar`.** Un PR podía pasar el CI en verde rompiendo la invariante 1.

`tests/calculo-publicado.test.mjs` cierra eso: las dos funciones son puras y reciben arrays, así
que no necesitan ni Excel ni IndexedDB. Verificado con las siete mutaciones que antes sobrevivían
—factor 100→10, ratio sobre totales en vez de la base alineada (L/100Km y L/Hora), `total_litros`
recortado a la base, el signo de `desvio_pct`, el signo de `exceso_litros`, y `calcularExceso`
midiendo sobre `total_litros`—: **las siete mueren ahora en `npm test`**.

La regla que queda: **si una función pura participa de un número que la app publica, su test va
en `tests/`, no solo en un arnés.** Lo que sí conviene dejar en un arnés y no volver unit test:
`autocorreccion.js` entero (escribe en IndexedDB y lo que importa es el efecto sobre la base),
`parseXLSX`/`inspeccionarArchivo` (necesitan SheetJS y `FileReader`), la coherencia de unidades
entre los dos lados de un cruce, y los totales de flota contra la línea base.

Lo que el mismo ejercicio dejó sin cubrir **se cerró el 24/09/2026**: `utilizacion()` y
`coberturaEquipo()` (los "días distintos con carga") se sumaron a
`tests/diagnostico-criterios.test.mjs`; `indexarMaestro()`/`resolverEquipo()` (la doble clave
interno+dominio) tienen archivo propio, `tests/analyzer-maestro.test.mjs`; y el filtro de
prefijo conocido de `sugerirPosibleTypo()` sumó el caso `ZZ02`/`['ZZ01']` a
`tests/normalizer-identidad.test.mjs`, para ejercitar la mitad del `||` que el caso viejo
(`TR99`) no tocaba por cortocircuito.

**Segunda vuelta de mutation testing, dirigida solo a lo recién cubierto.** El `/ship` de ese
mismo cierre hizo mutar a mano las funciones nuevas y encontró 10 mutaciones que `npm test`
todavía no agarraba — cobertura real pero incompleta, no bugs en producción. Se cerraron las 4
de mayor riesgo de negocio:

- `coberturaEquipo()` sin `periodo` explícito (el rango propio del equipo, uniendo fechas de
  `cargas` y `gps`) no tenía ningún test — el único caso sin período cortaba antes por 0 cargas.
- `indexarMaestro()`/`resolverEquipo()` nunca se probaban con `interno_key`/`dominio_key` **ya
  calculados** (solo con `interno`/`dominio` crudos): la asimetría de la invariante 1
  (interno pisa sin chequear, dominio no) podía romperse ahí sin que nada avisara.
- Un equipo del maestro sin `interno` ni `dominio` (fila vacía real en `Equipos.xlsx`) podía
  colarse al índice bajo una clave vacía sin que ningún test lo notara.

Quedan 6 sin cerrar, todas dentro de `utilizacion()` y de menor riesgo (ramas internas del
cálculo, no la lectura de datos): la rama `usaAlineadas = false` (`total_horas` +
`alin.meses_gps` en vez de `horas_alineadas`), un rango de `alineacion.meses` de más de un mes,
el fallback a `mesesEntre()` cuando no hay `meses`, los bordes exactos de los umbrales (`=
min*0.6`, `= max*1.25`), el campo `pct` de la respuesta (nunca asserteado), y el guard
`totalCorridos <= 0`. Ningún fixture actual setea `equipo.centro_costo`, así que tampoco se
prueba la rama por sector ni `JORNADA_EXCEPCIONES` (el caso de ÁRIDOS que motivó la función).

Lo único que sigue completamente abierto de la lista original: `actividadImplicita()`.
Aparte: `tools/auditar-declarados.mjs` ya es una suite de unit tests con otro nombre —46
chequeos sobre funciones puras, sin Excel, en menos de un segundo— y convendría migrarlo a
`node:test` para que deje de parecer que `sugerirMeta()` o `jornadaPonderada()` no tienen test.

**Un día del calendario no se convierte con `toISOString()`.** El primer bug que encontró esta
suite (24/09/2026) fue justamente ese: `diasHabiles()` armaba el día con
`cur.toISOString().slice(0,10)` mientras construía `cur` a medianoche **local**. toISOString
pasa a UTC, así que al este de UTC el string salía corrido un día para atrás y el chequeo de
feriado se hacía sobre el día anterior — la semana del 1 al 7 de junio daba 4 días hábiles en
vez de 5, y un sábado feriado se contaba como sábado trabajado. En UTC-3 (acá) y en UTC (el CI)
daba bien de casualidad, que es por lo que sobrevivió. Hoy se usa `isoLocal()` en feriados.js.

Para una fecha que es un **instante** (`fecha_alta_automatica`, `actualizado`, el `exportedAt`
del backup) `new Date().toISOString()` está bien y no hay que tocarlo. El problema es solo
convertir un Date construido desde partes locales a un día del calendario. Quedan dos usos
menores del mismo patrón, de bajo impacto y sin arreglar: `panel.js:536` calcula el mes en
curso con `toISOString()` (en UTC-3, después de las 21:00 del último día del mes devuelve el
mes siguiente) y tres lugares arman nombres de archivo con la fecha UTC.

`tests/feriados-zona-horaria.test.mjs` cubre la regresión corriendo la función en subprocesos
con `TZ` forzada. Tiene que ser un subproceso: **Node fija la zona horaria al arrancar**, así
que tocar `process.env.TZ` dentro de un test que ya importó `Date` no hace nada y el test daría
verde sin probar nada. El archivo incluye una guarda que falla si las zonas no se diferencian.

```bash
npm test                                  # toda la suite
node --test tests/feriados.test.mjs       # un solo archivo
```

**Ninguno reemplaza a otro, y esto importa.** `verificar` compara contra una línea base
congelada: detecta un número que **cambió**, nunca una fórmula que estuvo **mal desde el día
uno**. `auditar` recalcula todo desde su definición. Y `unidades` pregunta lo que ninguno de los
dos: **¿los dos lados de este cruce están en la misma unidad?** — la falla más silenciosa de
todas, porque un número en la unidad equivocada no rompe nada y sigue imprimiendo una cifra
plausible.

`auditar-unidades.mjs` hace tres cosas en orden: mira el formato real de cada campo (tipo, rango,
unidad), lo normaliza contra la unidad declarada en su tabla `UNIDADES`, y recién ahí cruza y
exige que los dos lados cierren. Cubre: fechas en un único formato ISO, horas en horas reales
(no fracción de día), `total = ralentí + movimiento`, horas que no superen las del rango
declarado, velocidad implícita dentro de lo físicamente posible, `importe = litros × precio`,
claves de cruce normalizadas, y **seriales de fecha de Excel disfrazados de otra cosa**.

Ese último chequeo encontró un caso real el 23/09/2026 — ver abajo.

Los dos lentos necesitan los Excel reales, que viven **fuera del repo**. El arnés los busca solo,
en este orden: `$FLOTACONTROL_ARCHIVOS`, `../ARCHIVOS`, `../CONSUMO DE COMBUSTIBLE/ARCHIVOS`,
`../../ARCHIVOS`. Hoy los encuentra en `NEW APP/CONSUMO DE COMBUSTIBLE/ARCHIVOS`.

### La línea base (`tools/invariantes.json`) es local a propósito

**Está en `.gitignore` por decisión, no por olvido** — y acá este repo es más estricto que el
hermano, que sí la versiona. La línea base contiene cifras reales de la flota (litros totales,
volúmenes, nombres de los archivos del cliente): es información de negocio, y la promesa del
proyecto es que los datos de la flota no salen de la computadora.

Consecuencia práctica: **cada clon arranca sin línea base** y `npm run verificar` no puede correr
hasta que alguien la genere. Se genera una vez, con los Excel reales a mano:

```bash
npm run verificar:actualizar
```

Para mantenerla fuera del repo en otra ubicación, `FLOTACONTROL_INVARIANTES` apunta a una copia
privada. La de este clon se generó el **23/09/2026**.

Esto también explica por qué el CI solo corre `declarados` e `importacion`: sin Excel y sin línea
base, los dos arneses lentos no tienen contra qué comparar. **Que el CI pase no significa que los
totales estén bien.** Eso solo lo dicen los dos arneses lentos, corridos localmente.

**La lentitud es `fake-indexeddb`, no la app.** Mantiene cada índice linealmente en cada `put()`:
1.381 `get()`+`put()` sobre un store con cuatro índices tardan 25,6 s contra 58 ms sin índices —
440× de penalidad que un IndexedDB real no paga. No "optimizar" el import persiguiendo esto.

El CI (`.github/workflows/ci.yml`) corre solo `declarados` e `importacion`: son los que no
necesitan los Excel, que nunca se versionan.

Chequeo de sintaxis de un módulo suelto, sin bundler:

```bash
node --input-type=module --check < js/data/analyzer.js
```

### Cargar las planillas reales en el navegador sin clickear

Levantar la preview (`limpio`), copiar los Excel a `_datos_prueba/` (gitignoreado) y empujarlos
al input desde la consola:

```js
const dt = new DataTransfer();
for (const n of nombres) {
  const r = await fetch('/_datos_prueba/' + encodeURIComponent(n));
  dt.items.add(new File([await r.arrayBuffer()], n));
}
const inp = document.getElementById('file-input');
inp.files = dt.files;
inp.dispatchEvent(new Event('change', { bubbles: true }));
document.getElementById('btn-process-all').click();
```

Tarda ~30 s. Después `window.ultimoAnalisis` tiene el análisis. **Borrar `_datos_prueba/` al
terminar**: son datos de flota.

**El caché te va a mentir, y acá hay DOS capas, no una.** Esto es distinto del repo hermano y
cuesta horas si no se sabe.

1. El servidor local no manda `Cache-Control`, así que el navegador se queda con los módulos de
   una corrida anterior.
2. **Esta app es una PWA: el Service Worker (`sw.js`) tiene su propio caché** (`flotacontrol-v4`)
   y **atiende el pedido antes de que llegue a la red**. Por eso `fetch(m, { cache: 'reload' })`
   —que alcanza en el repo hermano— **acá no sirve**: el pedido pasa igual por el SW y vuelve la
   versión vieja. Verificado el 23/09/2026: un fix ya aplicado en disco y ya medido por el arnés
   en Node seguía sin aparecer en el navegador, y el archivo servido no contenía el cambio.

La forma que **sí** funciona: desregistrar el SW, borrar sus cachés y recién ahí recargar.

```js
for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
for (const k of await caches.keys()) await caches.delete(k);
location.reload();
```

Cómo darse cuenta de que es esto y no un bug del código: pedir el módulo y mirar si el **texto
servido** tiene tu cambio.

```js
(await (await fetch('/js/data/normalizer.js')).text()).includes('miFuncionNueva')
```

Si da `false` pero el archivo en disco sí lo tiene, es caché — no es tu código.

Si el cambio incluye un bump de `DB_VERSION`, borrar antes la base
(`indexedDB.deleteDatabase('FlotaControlDB')`) — pero **sin abrirla después** para inspeccionarla:
un `indexedDB.open()` sin versión crea una base v1 vacía y te deja mirando un estado que
fabricaste vos. Para ver qué versión hay sin tocarla, `await indexedDB.databases()`.

## Arquitectura

### Las cuatro planillas → un modelo único

| Archivo | Aporta | Clave de cruce |
|---|---|---|
| `Equipos HSV*.xlsx` | Padrón: interno, dominio, marca, modelo | `INTERNO` |
| `Cargas_Combustible_*.xlsx` | Litros, costo, lugar, centro de costo, chofer | `INTERNO-DOMINIO` |
| `Resumen de Flota*.xlsx` (GPS) | Km, horas de ralentí y movimiento | `UNIDAD` |
| `Consumos Estimados*.xlsx` | La meta **y su unidad** (L/hora o L/100km) | `INTERNO` |

Las cuatro escriben el mismo equipo distinto (`TR-21` / `TR 21` / `TR21`, `CF1` / `CF01`).
`normalizeEquipoKey()` en `js/data/normalizer.js` es la **única** fuente de verdad para
colapsarlas. Comparar strings crudos en vez de la clave normalizada es una clase de bug
recurrente en la historia de este proyecto.

Que un equipo se mida en **L/hora** o **L/100km** lo decide la unidad declarada en "Consumos
Estimados"; el prefijo del interno es solo el fallback (`determineConsumptionType()`).

La columna `TIPO` del Excel de Equipos **no es confiable** (a los tractores les dice "CAMION").
La denominación canónica sale del prefijo del interno (`getDenominacion()`).

### Etapas del pipeline (leer en este orden para rastrear un bug)

1. **`js/parsers/xlsx-parser.js`** — detecta el formato y extrae filas. Maneja la fracción de día
   de Excel para las horas, varios formatos de fecha y columnas repetidas (`TIPO` aparece dos
   veces en Equipos → se renombra a `TIPO_2`). **Cualquier columna de GPS que Excel formatee como
   `[h]:mm` es un serial de fracción de día y necesita `parseExcelHours()`, nunca
   `parseNumber()`**, o sale 24× más chica.
2. **`js/parsers/esquemas.js`** — (propio de este repo) qué campos entiende la app de cada tipo de
   planilla, con sus sinónimos de encabezado y cómo reconocer el formato de cada columna. Las
   claves de `campos` son **exactamente** las que usan los importadores en `val(row, 'campo', ...)`,
   así que un mapeo confirmado en la vista previa se pasa tal cual al importador.
3. **`js/data/normalizer.js`** — claves, denominación, duraciones, metas. El GPS escribe el tiempo
   en **dos formatos según el alcance del reporte**: los mensuales dan fracción de día (`0.5` = 12 h)
   y un consolidado multi-mes da texto (`"3 days, 10:53:03"` = 82,88 h). Un parser que solo parte
   por `:` pierde el día entero, que son 72 de esas 82 horas.
4. **`js/data/database.js`** — IndexedDB. Dos tipos de store muy distintos:
   - `equipos` (el "maestro"): **persiste entre sesiones**, se fusiona sin destruir al reimportar
     (una subida nueva solo pisa campos que traen valor, y nunca pisa un campo que el usuario
     editó a mano — `editado_manual` marca cuáles están protegidos).
   - `raw_records` (los "movimientos"): **persisten entre sesiones** desde el 24/09/2026. Antes
     `app.js` los borraba en cada carga de página, lo que contradecía el aviso de privacidad y
     hacía perder todo el análisis con solo recargar. Ahora solo se vacían con el botón dedicado
     **"Vaciar datos"** (`reanalizar()` en app.js) o con la casilla "Reemplazar los movimientos ya
     cargados" al procesar, que **sigue tildada por defecto**: destildarla suma archivos a lo ya
     cargado, y un Resumen de Flota regenerado con otros valores se sumaría al viejo (el dedupe
     solo descarta copias EXACTAS) y duplicaría km y horas.
   Otros stores guardan correcciones del usuario que sobreviven a la reimportación porque se
   indexan por una **huella estable** del registro (`huellaCarga()`), no por el equipo asignado.
5. **`js/data/analyzer.js`** — reglas de negocio: alineación de períodos (`alinearCargasYGps`),
   métricas (`calculateMetrics`), tipo de cálculo, KPIs de flota.
6. **`js/data/diagnostico.js`** (~2.780 líneas) — el motor de diagnóstico: ~20 reglas `detectarXxx`
   que producen `hallazgos`. Cada hallazgo tiene `titulo` (escapado al renderizar) y `detalle`
   (**se renderiza como HTML crudo a propósito**, para poder poner `<strong>` en los números).
   Cualquier texto libre que venga de una planilla y termine dentro de `detalle` **tiene que**
   pasar por el `esc()` local de ese archivo. Es el tropiezo recurrente de este archivo: al agregar
   un hallazgo, buscar `detalle:` y revisar qué se está interpolando.
7. **`js/data/autocorreccion.js`** — corre una vez por `renderPanel()`, antes de dibujar nada.
   Aplica solo las correcciones **sin ambigüedad** y registra cada acción en `accionesAutomaticas`,
   para que aparezca como hallazgo "se aplicó sola" en vez de desaparecer en silencio.
8. **`js/ui/panel.js`** (~5.520 líneas, el archivo más grande) — el Panel unificado.
   `js/ui/datatable.js` (~2.214) es el editor de tablas crudas.

### Las tres invariantes que mantienen los números honestos

Cada una se agregó después de encontrarla violada. Son fáciles de romper sin querer:

**1. El mismo período de los dos lados de una razón.** Un consumo divide litros por actividad:
los dos operandos tienen que venir de los mismos meses. Lo mismo para cualquier resta contra una
meta. `alinearCargasYGps()` intersecta los meses con cargas de cada equipo con sus meses con GPS.
Los totales del período (`total_litros`, `total_km`, `total_horas`) quedan intactos: son gasto y
actividad reales y alimentan los KPIs.

*La trampa que hace este bug invisible:* el campo `periodo` de un registro es solo el mes de su
fecha de **inicio**, así que un GPS Ene–Jul lleva `periodo: '2026-01'` y mide siete meses.
Agrupar por `r.periodo` lo cuenta como enero. Usar `mesesDeRegistro(r)`.

**1b. Todo KPI de flota = Σ tarjetas + lo no asignado.** Un registro que no matchea ningún equipo
igual alimenta los totales, así que hay que acumularlo **entero**, no solo sus litros. El caso
testigo: una unidad de GPS llamada `PORTATIL` aportaba 6.903 km y 3.180 h con **cero litros** — era
invisible en todos los hallazgos (que agrupan por litros) mientras el KPI de km leía 6.903 de más.

**2. Una definición por concepto.** Estos viven en un solo lugar y se importan, nunca se
reescriben: `mediana()`, `coberturaEquipo()`, `utilizacion()`, `confiabilidad()` (diagnostico.js),
`JORNADA_REFERENCIA` (analyzer.js), `diasHabiles()` (feriados.js), `normalizeEquipoKey()`
(normalizer.js), `mesesDeRegistro()` (analyzer.js). Escribir una segunda versión "porque es más
rápido" ya produjo el mismo bug dos veces: la mediana inline con `arr.sort()[Math.floor(n/2)]`
devuelve el valor de arriba en una lista par, no el promedio de los dos centrales.

**3. Un número bajo necesita contexto antes de ser una conclusión.** Toda métrica que es una
**razón** puede dar chico solo porque la base es floja. Un total es un hecho; una razón es una
conclusión. Si `confiabilidad()` dice que la base no se sostiene, esa celda queda fuera del
cálculo de mejor/peor y se muestra atenuada con el motivo a la vista.

### Correcciones de código confirmadas (portadas del hermano el 23/09/2026)

En `js/data/normalizer.js`, aplicadas en el import por `js/parsers/xlsx-parser.js`. A diferencia
de `sugerirPosibleTypo()` —que solo sugiere, para que una persona confirme— estas ya están
confirmadas contra el comprobante por HSV y se aplican directo:

- **`GR01` → `GE01`**: ya NO es una corrección fija (desde el 25/09/2026). Es el caso real que
  motivó `sugerirPosibleTypo()`; ahora lo resuelve `resolucion-identidad.js` con evidencia (ver
  "Resolución automática de identidad") y queda revertible.
- **`TP0101` → `TP01`**: un cero de más. No lo agarraba `sugerirPosibleTypo()` porque el prefijo
  `TP` ya es conocido, así que quedaba aceptado en silencio como gasto fuera de flota.
- **`CALOVENTOR` / `MANTENIMIENTO` / `SURTIDOR` → `CL02` / `CL03` / `CL04`**: no son un equipo
  rodante, son cargas del caloventor de una sede. HSV tiene uno por sede, así que el **lugar de
  carga de esa misma fila** resuelve cuál sin ambigüedad: Godoy Cruz → CL02, Tunuyán → CL03,
  San Martín → CL04.

### Resolución automática de identidad (25/09/2026)

`js/data/resolucion-identidad.js` (puro, con tests) decide y `autocorreccion.js` aplica, anota en
`accionesAutomaticas` y **permite Deshacer**. Los registros guardan de dónde venían
(`_alias_de`, `_dominio_original`), así que revertir es exacto. Tres reglas:

- **Tipeo con evidencia**: el código está a una letra de un interno real, su prefijo no existe en la
  flota Y comparte lugar de carga o centro de costo con él. Sin esa pista no se toca. Medido: GR01
  → GE01 (ARIDOS / AMZA).
- **Servicio de planta escrito con su nombre**: LIMPIEZA en Godoy Cruz → LM01, CALDERA en Tunuyán →
  CA01 (`SERVICIO_POR_SEDE`). Hoy los datos ya traen el código, así que no dispara.
- **Un interno con dos patentes**: gana la del maestro; si no, la que duplica a la otra. Medido:
  MX59 → ONK194 (23 filas), BM14 → GNG059 (6).

El hallazgo "N equipos del maestro no figuran en Cargas" se **quitó a propósito**: un equipo sin
cargas no se analiza y no es un error (`totales.universo.fuera_principal` sigue existiendo).
Verificado con `npm run verificar`: totales idénticos (678.429,5 L / 1.278.888,9 km / 83.189,2 hs).
Cuidado: `CA`, `CL` y `LM` SÍ se dan de alta solos (están en las reglas de cálculo); la rama que
acepta como "gasto de planta" un prefijo con nombre pero sin regla hoy no se dispara con estos datos.

### Un mes cubierto a medias no entra al ratio

Portado el 23/09/2026 (`mesesCompletosDeFuente()` en analyzer.js, `ultimoDiaHabilDelMes()` en
feriados.js). Medido sobre los archivos reales ese mismo día:

```
Cargas  2026-01 .. 2026-08  completos
Cargas  2026-09             INCOMPLETO — 416 cargas, la ultima del dia 21 de 30
```

**Hoy septiembre zafa de casualidad, no por diseño**: no hay Resumen de Flota de septiembre, así
que la intersección con GPS lo deja afuera igual. El día que llegue ese GPS —que cubre el mes
entero por declaración— el consumo saldría con el numerador de dos tercios de mes y el
denominador completo: **~30% más bajo, plausible y mal**, en toda la flota a la vez.

Verificado simulando ese GPS de septiembre: **0 equipos meten septiembre en su ratio** y 20
quedan con el recorte declarado en `alineacion.meses_incompletos_recortados`.

Tres detalles que no son obvios:

- **La completitud es de la FUENTE, no del equipo.** Un equipo puede no haber cargado la última
  semana por motivos suyos y eso no vuelve al mes incompleto; lo vuelve incompleto que la
  planilla entera se corte ahí. Por eso se calcula una vez en `analizarFlota()` sobre todos los
  registros y se aplica igual a todos.
- **El corte es el último día HÁBIL, no el último del mes.** Mayo 2026 termina domingo 31 y su
  última carga es del sábado 30: la regla ingenua lo marcaría incompleto sin serlo.
- **Un GPS mensual cubre el mes entero por su rango declarado** aunque su última fila sea del día
  20, así que se mira `fecha_hasta` en los registros con rango y `fecha` en las cargas.

Se publica en `totales.meses_incompletos` con hasta dónde llega cada fuente y hasta dónde debería
llegar. Es **información, no advertencia**: que la planilla del mes en curso esté cortada es lo
normal (decisión cerrada: nunca se le informa al usuario "falta el mes X").

**Lo que todavía NO está cubierto: la retro-carga.** Si mañana se agregan a la planilla cargas de
un mes ya cerrado —una carga de agosto ingresada en octubre— entrarían a agosto y nada avisaría
de que un mes ya analizado cambió de valor. Medido el 23/09 sobre las 4.843 filas reales: **hoy
no pasa** (0 filas fuera de orden cronológico, 0 meses que reaparecen). Para cubrirlo haría falta
guardar un total por mes entre importaciones y comparar.

### Una fecha de Excel disfrazada de importe

Encontrado el 23/09/2026 por `npm run unidades`, sobre los archivos reales. La fila 4747 de
`Cargas_Combustible_HSV_2026.xlsx` (hoja Registros) trae **el mismo número** en tres columnas:

```
FECHA = 46281.43541666667   DMA = 46281.43541666667   COSTO TOTAL ($) = 46281.43541666667
```

Es el serial de fecha-hora de Excel del 16/09/2026 10:26: alguien arrastró la fecha sobre la
celda de costo al cargar la planilla. El importe real de esa carga es 197 L × 2.400 = **472.800**.

**Por qué no se podía dejar pasar:** 46.281 es un importe perfectamente plausible entre cargas
que van de 2.914 a 1.375.494. Nada lo delata. Contarlo tal cual mete un gasto falso en el KPI de
costo **y** esconde el real — 426.518 pesos que desaparecían del total de la flota.

**Por qué acá sí se recompone,** si la regla del proyecto es no auto-corregir plata: esa regla
existe porque un precio distinto puede ser un aumento real que solo una persona confirma contra
el comprobante. Este caso no es ese. El precio unitario está bien, los litros están bien, y el
importe **no es un importe**: es, al bit, la misma celda de fecha de su propia fila. No hay una
segunda lectura posible, así que entra en la misma categoría que las correcciones sin ambigüedad
de `autocorreccion.js`.

`importeDeCarga()` (xlsx-parser.js) lo recompone como litros × precio y **nunca pierde el dato
original**: queda en `_importe_original`, con `_importe_recompuesto` explicando el motivo. La
condición para disparar es estricta a propósito — coincidencia exacta con la celda de fecha de
la misma fila, más litros y precio disponibles — porque caer en el rango de seriales no alcanza
como señal: hay 28 importes legítimos en ese rango.

### Los duplicados se descartan al importar, no se reportan después

`insertRawRecords()` marca con `_dupe_exacta` cualquier fila idéntica a una ya guardada. Las filas
**se conservan** en IndexedDB y siguen visibles. Eso es lo que hace seguro volver a subir un
archivo o agregar meses nuevos sin limpiar.

Las entregas de Loop se fusionan por número de remito. **Cuando una fusión toca el mismo registro
ya guardado más de una vez dentro de la misma llamada, hay que acumular los cambios en un
`Map<id, cambios>` y hacer un solo `get()`+`put()` por id al final — nunca uno por toque.**
IndexedDB dispara los `get()` encolados antes de que resuelva el primer `put()`, así que cada
toque lee la misma foto vieja y el último `put()` en resolver pisa lo que los anteriores acababan
de escribir. Así se perdió el 43 % del volumen de Loop (31.822 m³ en vez de ~55.365) **sin un solo
error en ningún lado**. Lo encontró un arnés, no una relectura del código.

### Tres cosas de la interfaz que costaron una sesión (24/09/2026)

Salieron de un reporte de usuario con capturas de la app desplegada. Las tres se **reprodujeron en
el navegador con las planillas reales antes de tocar nada**, y en dos el reporte apuntaba a otra
causa que la real.

**Las filas de equipo se alinean con `flex-grow`, no con `space-between`.** `.diag-lista li` es
`flex` con `justify-content: space-between`: el espacio sobrante se reparte según el ancho del
texto de la derecha, que cambia en cada renglón, y el nombre del equipo caía a una distancia
distinta del borde en cada fila. Medido: x = 544, 573, 552, 573, 575 en la misma lista de ralentí.
El arreglo es `.diag-lista li > .diag-val { flex: 1 1 0 }` (solo ≥721 px; en móvil la fila pasa a
columna y un `flex-basis: 0` se leería como alto). **No** cambiar `justify-content`: las listas de
"aceptados" tienen solo nombre + botón y dependen de `space-between` para llevar el botón a la
derecha. Después: dispersión 0 en las cuatro listas medidas.

**Que un hallazgo desaparezca tras una acción no es un error.** El reporte era "no puedo marcar
aceptable el ralentí". El botón por fila **funcionaba** (TR34: 7.322 → 6.478 h). Lo que fallaba era
el final: al aceptar el último equipo del grupo, `reabrir()` volvía a abrir el modal "Revisar y
decidir" y este alertaba *"Ese hallazgo ya no está: los datos cambiaron"* — un éxito informado
como error. `abrirRevisarDecidir` recibe ahora `{ trasAccion }` y, si el hallazgo no existe después
de una acción, vuelve sin cartel. Abierto a mano y sin existir, el aviso se mantiene.

**Los "Resumen de viaje" no mueven el período, a propósito, y ahora la app lo dice.** Son
`solo_comparativa` (analyzer.js): el mismo reporte de Wara que el Resumen de Flota mensual, y sumarlos
duplicaría km y horas. Se cruzan contra el mensual en el hallazgo `resumen_vs_flota`. El reporte era
"el período mostrado es otro": los 6 archivos eran de **agosto**, ya dentro de ene–ago, así que no
había nada que mover — pero el panel no lo explicaba. Ahora el bloque "Período analizado" declara
cuántos hay y de qué meses. Este cruce además encontró un dato real: `Resumen de viaje.xlsx` de
CM-42 dice 63 km y el mensual ~4.540 (−4.476 km).

**Los datos ya no se pierden al recargar (24/09/2026).** Se sacó el `clearMovimientos()` de
`app.js`: cargas, GPS y demás movimientos persisten, igual que el maestro, y el aviso de privacidad
vuelve a ser verdad. Verificado: 12.792 registros en la base después de recargar, y los mismos
totales (678.429,5 L / 1.278.888,9 km). Para vaciar hay un botón dedicado, "Vaciar datos" (antes
"Re-analizar", un nombre que no decía que borraba).

**El Service Worker sirve JS y CSS primero desde caché: hay que subir `CACHE_VERSION` en cada
release.** Estuvo en `flotacontrol-v2` desde la Fase 7 mientras el código seguía cambiando, así que
quien ya había visitado la app **no volvía a bajar los archivos nuevos**: ninguno de los arreglos
posteriores le llegaba. Dos tests lo protegen (`tests/configuracion.test.mjs`): que la versión no
vuelva atrás, y que todo archivo de `js/` y `styles/` esté en `PRECACHE` (un módulo nuevo olvidado
solo queda offline después de pedirse una vez con internet). Ahora está en `v3`. Subir el número
sigue siendo manual: el test impide retroceder, no olvidarse de avanzar.

**Alcance parcial de una carga (`js/data/alcance.js`).** Si lo subido cubre **un solo tipo de
equipo** dentro de una flota con varios (caso real: los `Resumen de viaje` de seis camionetas,
todos de agosto), la app **pregunta** en vez de decidir sola: analizar solo ese tipo y esos meses, o
descartar el recorte y quedarse con el período común de toda la flota. Reglas:

- **Siempre meses completos**: un resumen del 1 al 15 no autoriza a recortar a ese mes
  (`mesesCompletosDeRango`). Septiembre sigue fuera del período por lo mismo.
- **El recorte saca también los registros de los otros tipos**, no solo los equipos: si quedaran
  como "no asignados" seguirían sumando a los totales (invariante 1b) y el recorte no recortaría nada.
- **Un recorte activo tiene que verse**: chip "Alcance: solo CAMIONETA · 2026-08 — no es toda la
  flota" con botón "Quitar" arriba del bloque de período.
- La decisión se guarda en el store `config` (clave `alcance_decision`, sin cambiar el esquema) contra
  la **firma** del conjunto de resúmenes: no vuelve a preguntar al reabrir, pero sí si se suben otros.
  Verificado sobre los archivos reales: "Solo" → 8 camionetas, 01→31 de agosto, 32 cargas, y recarga
  que reaplica el recorte sin preguntar; "Quitar" → 84 equipos, ene–ago, 4.424 cargas, 678.429,5 L.

**Un dato dudoso deja de perderse: reclamar o dejarlo en seguimiento.** En el hallazgo
`resumen_vs_flota`, las filas con diferencia (hoy CM-42: −4.476 km) ofrecen **Reclamar GPS** y
**Marcar para seguimiento**, los dos con la diferencia y las posibles acciones ya escritas, más
"Posibles acciones" (`CONSEJOS.resumen_vs_flota`) en la tarjeta. El seguimiento reutiliza el
"Estado" del equipo (`abrirEstadoEquipo(interno, { categoria, motivo })`), que **sí persiste**:
verificado que sobrevive a una recarga. El "ojito" de la tarjeta (`diagSeguimiento`) en cambio es
solo de sesión; para algo que tiene que quedar, usar "Estado".

### Convención de escapado (XSS)

No hay módulo compartido: `const esc = (s) => ...` está duplicado **literal** al inicio de cada
archivo de UI que arma `innerHTML` con datos dinámicos. Al crear un archivo nuevo que renderice
texto venido de una planilla, copiar ese mismo helper en vez de inventar otro, y escapar **en el
punto donde se interpola** el texto no confiable — no la plantilla entera, porque varios lugares
mezclan a propósito `<strong>`/`<code>` literales con datos escapados.

### Cambios de esquema en IndexedDB

`database.js` usa un `DB_VERSION` que solo incrementa, con un `onupgradeneeded` que **únicamente
agrega** stores: no hay camino de migración para renombrar o transformar un campo existente. Cada
bump lleva un comentario inline que explica qué agregó y por qué. Mantener esa convención.

## Decisiones cerradas — no volver a discutirlas

- **NUNCA agregar `"type": "module"` al `package.json`.** `xlsx.full.min.js` es UMD y los arneses
  lo cargan con `createRequire()`. Bajo `type: module` ese `require()` devuelve un objeto vacío, el
  parseo produce 0 filas y la verificación mide **0 equipos en vez de 189 — sin lanzar un error**.
  Hay un `_comment` en el `package.json` diciéndolo.
- **Ningún CDN externo.** Font Awesome está vendorizado en `vendor/`. Si alguna vez se suma
  Chart.js, vendorizar también sus dependencias: el bundle `+esm` de jsDelivr importa
  `@kurkle/color` **de la red en runtime**, lo que rompe la app sin conexión.
- **INTERNO sin DOMINIO no es un error. DOMINIO sin INTERNO tampoco.** Nunca se marcan como
  advertencia ni se le pide al usuario que corrija. El análisis avanza con lo que hay.
- **Que falte un mes no es un error.** Se analiza la intersección de meses con datos en ambas
  fuentes, aunque sea uno solo, y **se declara cuál es**. Nunca se informa "falta el mes X".
- **Los kilómetros de Loop nunca se usan como denominador.** Medido: 110.858 km contra 215.658 del
  GPS en los mismos equipos y meses (51 %). Es distancia de viaje cargado, no recorrido total.
- **Solo se autocorrigen códigos que aportan algo** (litros, km u horas > 0). Un código que
  aparece únicamente en Loop sin ninguna carga —`MAQUILA`, `GENCO`, nombres de cliente u obra— no
  se da de alta ni se acepta: se descarta.
- **"Posible repetida" no es un hallazgo.** Dos cargas del mismo equipo, el mismo día, con los
  mismos litros pero distinto importe u hora **son legítimas** (dos surtidores, dos turnos). Solo
  el duplicado **exacto** tiene una corrección obvia, y esa ya se aplica sola.

## Cómo se publica

**GitHub Pages**, vía `.github/workflows/pages.yml`, en cada push a `main`. No hay entorno de
staging entre el commit y el sitio publicado.

A diferencia del repo hermano, **este repo no tiene hook `post-commit` que pushee solo**: acá un
commit es local hasta que alguien hace `git push`.
