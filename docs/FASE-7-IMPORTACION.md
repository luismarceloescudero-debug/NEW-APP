# Fase 7 — Importación flexible y planilla principal

**Fecha:** 18/09/2026 · Implementa PLAN4.md, Fase 7.

## Reglas de negocio (decididas por el usuario)

1. **Identidad = "INTERNO DOMINIO"**, por ejemplo `TR21 AD291BF`.
   - `TR-21`, `TR 21` y `TR21` son el mismo interno.
   - Todo se asocia a esa combinación.
2. **Manda la planilla principal**, por defecto la de combustible:
   - solo se analiza lo que está cargado en ella;
   - un equipo del maestro que no figura ahí no entra al análisis, pero se lista aparte.
3. **La planilla principal puede ser otra** (cubiertas, otro bien), mientras traiga interno y dominio.
4. **El reporte de la estación GRIS se subió por error.** Sus cargas ya están en la planilla global y nunca deben sumar litros.

## Qué cambió para el usuario

| Antes | Ahora |
|---|---|
| Una planilla con columnas renombradas (`HP` por `POTENCIA`) se importaba en silencio como "otra planilla". El maestro quedaba vacío sin ningún aviso. | Aparece la **vista previa de columnas**: tipo sugerido, formato detectado y ejemplos por columna, y campo sugerido. No se importa hasta confirmar. |
| Cada archivo de un formato nuevo había que revisarlo siempre. | El formato confirmado **se recuerda** por su firma (el conjunto de encabezados). El próximo archivo igual entra solo. Si cambian las columnas, se vuelve a pedir revisión. |
| Se analizaban los 189 equipos del maestro, tuvieran o no cargas. | Se analizan los que figuran en la planilla principal: **84**. Los demás van al hallazgo "no figuran en Cargas de Combustible", ordenados por km de GPS. |
| La app solo sabía analizar combustible. | En Configuración se elige la **planilla principal**. Si no es combustible, el panel muestra por "interno dominio" la cantidad de registros y los totales de cada columna numérica. |
| Un reporte que repetía cargas de la planilla global se podía sumar. | Se mide la superposición (misma fecha, equipo y litros). Por defecto **se guarda aparte**, también cuando el formato ya estaba recordado. |

## Números antes y después (datos reales, enero–agosto 2026)

| Métrica | Antes | Después | Por qué |
|---|---:|---:|---|
| Equipos analizados | 189 | 84 | Solo los que figuran en Cargas (78 del maestro + 6 dados de alta automáticamente) |
| Litros (KPI) | 678.330 | 678.330 | Sin cambio: todo el combustible sigue contado |
| Cargas | 4.683 | 4.683 | Sin cambio |
| Km (KPI) | 1.754.288 | 1.275.850 | Ya no cuenta los 478.439 km de equipos sin ninguna carga |
| Horas (KPI) | 139.055 | 83.398 | Mismo motivo |
| Equipos sobre meta | 36 | 36 | Sin cambio |

- La referencia vieja quedó guardada fuera del repo como `referencia/invariantes__2026-09-18_antes-fase7.json`.
- La nueva se regeneró **solo** después de verificar que las únicas diferencias fueran las de esta tabla.

## Equipos que quedaron fuera y conviene revisar

- **46 equipos del maestro tienen GPS pero ninguna carga** (sobre todo cargadoras CF), con 478.439 km. Los que más recorrieron son tractores, por ejemplo uno con 41.079 km.
- **Lo más probable:** cargan bajo otro código (solo la patente, o un interno mal escrito) o desde un tanque que no figura en la planilla.
- El hallazgo los lista primero, con la leyenda "¿carga con otro código?".

## Errores encontrados y corregidos en esta fase

| Error | Efecto | Corrección |
|---|---|---|
| **`TR-21 AD291BF` perdía la patente.** La regla "un código con guion es un interno" (pensada para `MX-108-VL` del GPS) se aplicaba a la celda entera antes de separar por espacios. | La identidad quedaba incompleta. En los datos reales de 2026 no había celdas así, así que no movió números; habría pasado con la próxima que las trajera. | Si la celda tiene dos pedazos y son un interno y una patente, se separa (`normalizer.js`). |
| **Con solo la patente, la vista previa no sugería Cargas.** El esquema exigía "interno". | Un reporte con columna `Patente` se sugería como "otra planilla". | La identidad se cumple con interno **o** dominio (`esquemas.js`). |
| **Una planilla de cubiertas se sugería como Cargas de Combustible**, porque "Cantidad" era sinónimo de litros. | Aceptando sin mirar, se habrían sumado cubiertas como litros. | "Cantidad" y "Volumen" ya no sugieren litros; se pueden elegir igual a mano. |
| **Un formato recordado como "incorporar" se sumaba a ciegas.** Reproducido en el navegador: 240 L pasaban a 420 L. | Un reporte tipo GRIS duplicaba litros en silencio. | Cada archivo de un formato recordado vuelve a medir la superposición. Si repite el 20% o más, se guarda aparte. |
| **El número de fila de Excel se sumaba como un dato** en cualquier planilla genérica ("Fila excel: 5"). | Aparecía una métrica sin sentido en las pestañas y en el panel genérico. | Se ignoran los metadatos internos (`__fila_excel`). |

## Archivos

| Archivo | Qué hace |
|---|---|
| `js/parsers/esquemas.js` | Campos por tipo con sinónimos, puntaje, firma de encabezados y formato de cada columna |
| `js/parsers/xlsx-parser.js` | `inspeccionarArchivo()`, `superposicionConCargas()`, aplicación del mapeo confirmado o recordado, protección de duplicados |
| `js/ui/mapeo.js` | Vista previa y mapeo de columnas |
| `js/ui/upload.js` | Inspecciona antes de importar; orden reconocidos → recordados → a revisar |
| `js/data/analyzer.js` | Universo de la planilla principal; `totales.universo` con los que quedaron fuera |
| `js/data/diagnostico.js` | Hallazgos `fuera_principal` e `identidad_inconsistente` |
| `js/data/normalizer.js` | `identidadTexto()` ("INTERNO DOMINIO" para mostrar) y el arreglo de la patente perdida |
| `js/ui/panel-generico.js` | Panel cuando la principal no es combustible |
| `js/ui/config.js` | Elección de la planilla principal |
| `tools/probar-importacion.mjs` | Arnés de la fase: 46 chequeos con planillas inventadas; corre en CI |

## Verificación

| Prueba | Resultado |
|---|---|
| `npm run importacion` (planillas inventadas) | 46/46 OK |
| `npm run verificar` (datos reales) | OK contra la referencia nueva |
| `npm run auditar` (datos reales) | OK, 2.238 chequeos |
| `npm run declarados` | OK, 101 chequeos |
| Navegador: padrón con `N° Interno`/`Patente`/`HP` | Vista previa con todas las columnas bien sugeridas; importa con la potencia leída desde `HP` |
| Navegador: cargas con `ZZ-02 AA000AB` | Conserva la patente; universo = los 2 equipos con cargas; el tercero queda en el hallazgo |
| Navegador: Cubiertas como planilla principal | Se sugiere "Otra planilla", no Cargas. El panel muestra por "interno dominio" la cantidad y el costo |
| Navegador: planilla global + reporte GRIS en el mismo lote, con el formato recordado | 240 L (no 420); el reporte queda "(aparte)" |

## Pendiente

- **Identidad inconsistente:** en los datos reales hay 2 internos con dos patentes cada uno (MX59 `ONK194`/`OKN194`, BM14 `GNG59`/`GNC59`). Hay que corregirlos en la planilla de origen.
- **Clave de cruce de la patente:** `AA000AB` se compara como `AA0AB`, porque la función que quita ceros al interno también se aplica a la patente. Ambos lados se deforman igual, así que el cruce funciona, pero no es lo ideal. No se tocó para no mover datos guardados en navegadores.
