---
name: ciclo-de-entrega
description: >
  Ciclo completo de entrega de FlotaControl (repo NEW-APP) — revisar, arreglar, testear,
  verificar en el navegador y publicar. Usar SIEMPRE que el pedido sea "arreglá esto",
  "revisá el repo", "testeá", "subilo", "mejorá X", "seguí con el plan", o cualquier reporte
  de bug o pedido de cambio sobre la app. También al retomar trabajo después de una
  interrupción, para saber qué quedó a medias. No usar para preguntas que solo piden leer o
  explicar algo sin tocar código.
---

# Ciclo de entrega — repo NEW-APP

## 0. Antes de tocar nada: ¿estás en el repo correcto?

```bash
git remote -v          # tiene que decir NEW-APP.git
git log -1 --oneline
git status --short
```

Hay **dos repos FlotaControl y tres carpetas** en disco. Si el remote dice `flotacontrol.git`,
estás en el hermano, no acá. Y para previsualizar, la preview de este repo se llama **`limpio`**
— pedirla como `flotacontrol` levanta el proyecto equivocado y la app carga bien sin reflejar
ningún cambio, que es el síntoma más confuso posible.

## 1. Entender antes de cambiar

Leer, en este orden, solo lo que haga falta:

1. `CLAUDE.md` — arquitectura, invariantes, deuda conocida contra el hermano.
2. La skill `flotacontrol-reglas-negocio` — lo que ningún cambio puede violar.
3. La skill `calculos-combustible` — si el cambio toca una cifra.
4. El archivo que vas a tocar, **entero**, no solo la función.

**Si el pedido viene de una captura de pantalla:** buscar el texto exacto de la captura en el
código (`grep`) **en las tres carpetas** antes de concluir nada. Una sesión anterior no lo hizo y
dejó documentado como verdad que un modal "nunca se integró", cuando existía en el otro repo.

## 2. Medir antes de arreglar

La regla del proyecto: **si no se midió, no se afirma.** Antes de cambiar una lógica que toca
números, correr el arnés y anotar el valor de partida. Después del cambio, volver a correrlo y
comparar. "Lo arreglé" sin un antes y un después no es un arreglo, es una hipótesis.

## 3. Verificar

```bash
npm run probar      # los cuatro arneses, del más rápido al más lento
```

| Arnés | Qué pregunta | Cuándo es obligatorio |
|---|---|---|
| `npm run declarados` | ¿Las funciones puras siguen dando lo mismo? | siempre (es instantáneo) |
| `npm run importacion` | ¿La Fase 7 sigue reconociendo planillas? | si tocaste parsers o esquemas |
| `npm run unidades` | ¿Los dos lados de cada cruce están en la misma unidad? | si tocaste parsers, o agregaste un campo numérico |
| `npm run verificar` | ¿Los totales coinciden con `tools/invariantes.json`? | si tocaste `js/data/` o `js/parsers/` |
| `npm run auditar` | ¿Cada número se re-deriva de su definición? | idem |

**Ninguno reemplaza a otro.** `verificar` compara contra una línea base congelada: detecta un
número que **cambió**, nunca una fórmula que estuvo **mal desde el día uno**. `auditar` recalcula
todo desde su propia definición. `unidades` pregunta lo que ninguno de los dos —si los dos lados
de un cruce están en la misma unidad— que es la falla más silenciosa: no rompe nada y sigue
imprimiendo una cifra plausible.

Si `verificar` falla y **el cambio de número es intencional**, recién ahí:

```bash
npm run verificar:actualizar
```

...y el commit tiene que explicar **por qué** se movió cada número. Actualizar la línea base para
que deje de fallar, sin entender el delta, es exactamente lo que la línea base existe para impedir.

Chequeo de sintaxis suelto, sin bundler:

```bash
node --input-type=module --check < js/data/analyzer.js
```

## 4. Verificar en el navegador lo que el arnés no cubre

Un arnés no ve una tarjeta rota, un botón sin estilo ni una fila desalineada.

1. `preview_start` con `name: "limpio"`.
2. Copiar los Excel a `_datos_prueba/` y empujarlos al input desde la consola (el snippet está en
   `CLAUDE.md`). Tarda ~30 s.
3. `window.ultimoAnalisis` tiene el análisis: `.totales` para la flota, `.filas[].metrics` por equipo.
4. Revisar consola y red. **Borrar `_datos_prueba/` al terminar** — son datos de flota.

**El caché te va a mentir, y acá hay DOS capas.** Además del caché de módulos del navegador,
**esta app es una PWA y el Service Worker atiende el pedido antes que la red**: `fetch(m,
{ cache: 'reload' })` —que alcanza en el repo hermano— acá **no sirve**. Hay que desregistrar el
SW y borrar sus cachés:

```js
for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
for (const k of await caches.keys()) await caches.delete(k);
location.reload();
```

Cómo distinguir caché de bug: `(await (await fetch('/js/data/normalizer.js')).text()).includes('miFuncionNueva')`.
Si da `false` y el archivo en disco sí lo tiene, es caché — no es tu código.

## 5. Publicar

```bash
git add <archivos puntuales>     # nunca 'git add -A' a ciegas
git commit
git push
```

**Este repo NO tiene hook `post-commit`**: el commit es local hasta que hacés `git push`. (El
hermano sí lo tiene y pushea solo — no confundir los dos.)

El push a `main` dispara `.github/workflows/pages.yml` y **publica a GitHub Pages**. No hay
staging entre el commit y el sitio publicado: no commitear trabajo a medias "para guardarlo".

El CI (`ci.yml`) corre `declarados` e `importacion` — los que no necesitan los Excel, que nunca
se versionan. Que el CI pase **no** significa que los totales estén bien: eso solo lo dicen los
dos arneses lentos, que corrés vos localmente.

## 6. Qué escribir en el commit

El mensaje explica **por qué**, no qué líneas cambiaron (eso ya está en el diff):

- Qué se rompía y cómo se notaba.
- La causa raíz, no el síntoma.
- El número antes y el número después, si se movió alguno.
- Qué quedó deliberadamente afuera y por qué.

Los mensajes de este proyecto van **en español y sin tildes** (compatibilidad de consola).

## 7. Al terminar

Si el cambio tocó arquitectura, un cálculo, el modelo de datos o el flujo de importación,
**actualizar `CLAUDE.md`** en la misma tanda. La documentación que queda atrás es peor que la que
no existe: la próxima sesión la va a leer como verdad.
