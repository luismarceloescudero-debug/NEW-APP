# Fase 6 — Release 1.0.0

**Fecha:** 18/09/2026

## Resultado de los tres arneses

Contra los datos reales y la referencia fijada en la Fase 0:

```bash
export FLOTACONTROL_ARCHIVOS="/ruta/a/CONSUMO DE COMBUSTIBLE/ARCHIVOS"
export FLOTACONTROL_INVARIANTES="/ruta/a/CONSUMO DE COMBUSTIBLE/referencia/invariantes.json"
npm run probar
```

| Arnés | Resultado |
|---|---|
| `declarados` | OK — 101 chequeos |
| `verificar` | OK — coincide con `invariantes.json` (183 equipos, 4.683 cargas, 720.231,7 L) |
| `auditar` | OK — 3.411 chequeos, 189 equipos |

## Smoke test contra la app real (no solo los arneses)

A diferencia de las Fases 2–5 (probadas mayormente con la base vacía o con Ollama simulado),
acá se cargaron los **archivos Excel reales** en la app servida por HTTP, igual que un usuario:
`Equipos HSV SJ-MZA 2026.xlsx`, `Consumos Estimados 2026.xlsx` y un `Resumen de Flota` (GPS de
enero). Se hizo por `fetch`+`File`+`DataTransfer` dentro de la página (nunca se copiaron las
planillas al repositorio: viven fuera, en `CONSUMO DE COMBUSTIBLE/ARCHIVOS/`; el archivo
intermedio en base64 se sirvió desde `scratch/`, ignorado por git, y se borró al terminar).

| Prueba | Resultado |
|---|---|
| Procesar planillas reales | 183 equipos, 134 con meta, 120 movimientos — exacto a la referencia |
| Panel con datos reales | Todos los KPIs, hallazgos (3) y el diagnóstico automático renderizan sin errores de consola |
| Reimportar los mismos archivos | Sigue en 183 equipos / 120 movimientos — **sin duplicar** |
| Consola del navegador | Sin errores propios (solo el intento esperado de contactar Ollama, inexistente en este entorno) |
| Vista móvil (375px) con datos reales | Ver "Bugs encontrados y corregidos" abajo |

## Bugs encontrados y corregidos en este smoke test

Ninguno de los tres arneses (que no tienen DOM) podía detectar esto — apareció recién al probar
la vista móvil con datos reales cargados, con más de un hallazgo generado:

1. **Hallazgo "normalizaciones" desbordaba la pantalla.** Ese hallazgo (`diagnostico.js`)
   reutiliza la fila corta "equipo + valor" (`.diag-eq`/`.diag-val`) para mostrar párrafos
   completos. La regla `white-space: nowrap` de esa fila (pensada para un valor corto tipo
   "762 h en ralentí") dejaba el párrafo en una sola línea de hasta 1.900 px de ancho.
   → `styles/panel.css`: se agregó una regla scoped a `li[data-hallazgo="normalizaciones"]`
   que permite el wrap normal.
2. **Los filtros de Base de Datos y del Panel se salían de la pantalla en celular.** Una fila de
   `<select>` (`.toolbar-row`) es a la vez flex-item de un contenedor en columna y flex-container
   de sus propios `<select>`; `align-items: stretch` no alcanzaba para hacerla encoger al ancho
   real de la pantalla — el navegador la dejaba con el ancho que sus opciones más largas pedían.
   → Se agregó `width: 100%` explícito (además de `min-width: 0`).
3. **La fila de botones de Base de Datos (Columna/Equipo/Historial/Exportar) no bajaba de línea.**
   `.table-head-actions` tenía `flex-shrink: 0` a propósito (no achicar los botones), pero eso le
   impedía además pasar a ocupar toda su fila y dejar que sus propios botones (que sí tienen
   `flex-wrap: wrap`) se acomodaran en más de una línea.
   → `width: 100%` en la media query de celular.
4. **Consecuencia de los tres anteriores:** con la página desbordada horizontalmente, el panel de
   IA (`position: fixed`) quedaba mal ubicado (su "viewport" de referencia se corría con el
   contenido desbordado). Se resolvió solo al arreglar las causas 1–3: con `scrollWidth` igual al
   ancho real de pantalla, el panel de IA vuelve a posicionarse correctamente.

Los tres cambios son acotados (una regla CSS cada uno, dentro de la media query de celular que
ya existía) y no tocan el layout de escritorio.

## Instalación y sin conexión

Verificado en la Fase 4 (service worker activo, 38 archivos cacheados, consola limpia). No se
repite acá; ver `docs/FASE-4-PWA.md`.

## Rollback

Cada fase quedó en un commit separado en `main`:

```
dd6a93f Commit inicial: FlotaControl local-first
7e09fff Fase 0: reconciliar datos y quitar código pegado que inflaba los KPIs
9b67bed Fase 1: licencia MIT, sin secretos en el frontend, backend remoto fuera del deploy, CI
5aae51b Fase 2: prototipo visual (sin lógica) de las 4 pantallas nuevas
21282f6 Fase 3: backup y restauración de los datos guardados en el navegador
bf65b93 Fase 4: PWA instalable y sin conexión, CSP, sin CDN externo
eba3c55 Fase 5: asistente IA con Ollama directo, sin backend
```

Para deshacer un release problemático sin perder historial:

```bash
git revert <hash-del-commit-a-deshacer>
git push
```

GitHub Pages redespliega solo al detectar el push (workflow `pages.yml`). Si el problema es el
service worker sirviendo una versión vieja después del revert, subir `CACHE_VERSION` en `sw.js`
en el mismo commit del revert para forzar que los navegadores bajen la versión revertida.

## Pendiente para un release siguiente (no bloquea 1.0.0)

- Probar con una instalación real de Ollama (esta sesión no tuvo una disponible; se probó con
  `fetch` interceptado — ver `docs/FASE-5-IA-LOCAL.md`).
- Probar "modo avión" real en un navegador (esta sesión solo pudo verificar el Cache Storage y
  la lógica de `sw.js`, no cortar la red de verdad).
- La tabla de Base de Datos sigue con scroll horizontal propio en celular (esperado para una
  tabla ancha; una versión con tarjetas para mobile es una mejora de producto, no un bug).
