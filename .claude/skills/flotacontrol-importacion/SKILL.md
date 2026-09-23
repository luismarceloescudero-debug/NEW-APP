---
name: flotacontrol-importacion
description: >
  Aplicar al tocar la importación de planillas de este repo (NEW-APP): xlsx-parser.js,
  esquemas.js, ui/mapeo.js, o al agregar soporte para un tipo de planilla nuevo. Cubre la
  Fase 7 (importación flexible) — la detección de formato, la vista previa de columnas y la
  detección de superposición — que es propia de este repo y NO existe en el repo hermano.
---

# Importación flexible (Fase 7) — lo propio de este repo

Esta es la capacidad que justifica la bifurcación: el hermano importa solo lo que reconoce
exacto, y lo demás cae al importador genérico **en silencio**. Acá un archivo que no matchea
abre una vista previa y deja corregir **antes** de combinar nada.

## Las tres piezas

| Pieza | Archivo | Rol |
|---|---|---|
| Esquemas | `js/parsers/esquemas.js` | Qué campos entiende la app de cada tipo de planilla, sus sinónimos de encabezado, cuáles son imprescindibles, y cómo reconocer el formato de una columna |
| Inspección | `inspeccionarArchivo()` en `js/parsers/xlsx-parser.js` | Puntúa el archivo contra cada esquema y sugiere tipo + mapeo columna→campo |
| Vista previa | `js/ui/mapeo.js` → `abrirVistaPrevia(insp, file)` | Muestra la sugerencia, deja corregirla, devuelve la decisión (o `null` = omitir) |

## La regla que ata todo

**Las claves de `campos` en `esquemas.js` son EXACTAMENTE las que usan los importadores** en
`val(row, 'campo', ...)`. Un mapeo `{campo: 'ENCABEZADO'}` confirmado en la vista previa se pasa
tal cual al importador, que lo respeta **antes** que sus propios nombres por defecto.

Si agregás un campo a un esquema con un nombre que el importador no usa, la vista previa lo va a
ofrecer y el importador lo va a ignorar — sin error, sin aviso. Verificá siempre los dos lados.

## Superposición: el caso que motivó la detección

Antes de importar algo como Cargas, se mide **cuántas de sus filas ya existen** en las cargas
cargadas (misma fecha, interno/dominio y litros).

Caso real: el reporte de la estación **GRIS** repetía cargas que ya venían en la planilla global.
Importarlo sumaba litros que no existieron.

La decisión por defecto es **conservadora**: si se superpone por encima de `UMBRAL_SUPERPOSICION`
(0,2), se guarda **aparte** y **no suma litros**. Incorporarlo al cálculo es una decisión
explícita del usuario, nunca el default.

**No cambiar ese default a "sumar".** Un litro de más es invisible en el total y corre todos los
consumos.

## Al agregar un tipo de planilla nuevo

1. Sumar su esquema a `ESQUEMAS` con sus sinónimos reales de encabezado (los de la planilla que
   te pasaron, verificados — no los que te parecen probables).
2. Marcar qué campos son **imprescindibles**: son los que deciden si el archivo puntúa como ese
   tipo o cae a genérico.
3. Escribir su importador en `xlsx-parser.js` usando **las mismas claves** de campo.
4. Agregar un caso a `tools/probar-importacion.mjs` con una planilla inventada que lo ejercite.
   Ese arnés corre en CI y es instantáneo: no hay excusa para no sumarlo.
5. Correr `npm run importacion` y después `npm run probar` completo.

## Lo que no se toca

- **El importador genérico sigue siendo la red de contención**, no el camino principal. Guarda
  todas las columnas y suma solas las numéricas. Un archivo que cae ahí **no es un error**: es
  una planilla que todavía no tiene esquema.
- **Ninguna importación pisa datos del maestro editados a mano.** `editado_manual` marca los
  campos protegidos; una subida nueva solo escribe campos que traen valor.
- **Los duplicados exactos se apartan al importar, no se borran.** Quedan visibles en Base de
  Datos con `_dupe_exacta`. Eso es lo que hace seguro volver a subir un archivo.
- **Las entregas de Loop se fusionan por remito con un solo `get()`+`put()` por id**, acumulando
  los cambios en un `Map<id, cambios>`. Un `get()`+`put()` por toque hace que los toques
  paralelos lean la misma foto vieja y el último pise a los anteriores: así se perdió el 43 % del
  volumen de Loop, sin un solo error en ningún lado.

## Verificar un cambio acá

```bash
npm run importacion     # instantáneo, sin Excel — corre en CI
npm run verificar       # totales contra la línea base (necesita los Excel)
```

Si tocaste el parseo, los dos. `importacion` prueba que la detección y el mapeo funcionan;
`verificar` prueba que no cambiaste cuántos litros entran.
