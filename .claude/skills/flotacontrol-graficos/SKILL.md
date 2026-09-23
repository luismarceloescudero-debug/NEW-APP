---
name: flotacontrol-graficos
description: >
  Aplicar al agregar cualquier visualización o gráfico a este repo (NEW-APP). Incluye el paso
  previo obligatorio —vendorizar Chart.js, que acá todavía NO está— el estilo consistente con
  el panel, y qué métricas ameritan gráfico y cuáles no.
---

# Gráficos — repo NEW-APP

## Antes que nada: acá NO hay Chart.js

`vendor/` tiene **solo Font Awesome**. El repo hermano sí tiene Chart.js vendorizado (lo usa su
vista de Rendimiento). Si vas a agregar un gráfico, el primer paso es vendorizarlo.

**La trampa, ya documentada y medida en el hermano:** el bundle `+esm` de jsDelivr **importa
`@kurkle/color` desde la red en runtime**. Vendorizar solo Chart.js deja la app con una
dependencia de red silenciosa: funciona en tu máquina con internet y **rompe sin conexión**, que
es justo lo que la PWA promete. Hay que vendorizar **también** esa dependencia y reescribir el
import a la ruta local.

Y es una decisión cerrada del proyecto: **ningún CDN externo**. Si se actualiza Chart.js alguna
vez, hay que repetir el paso completo.

Hay un patrón a seguir para vendorizar: `tools/vendorizar-fontawesome.cjs`.

## Cuándo un gráfico vale la pena

**Sí:**
- Serie temporal por equipo (ralentí mes a mes de un mixer).
- Comparación multi-equipo **con banda** de referencia (mediana ± rango de pares).
- Distribución (L/m³ de los mixers en un scatter, con la mediana como línea).

**No:**
- Un solo número — eso es un KPI, no un gráfico.
- Un valor sin contexto de referencia — un punto solo no dice nada. Es la invariante 3: un
  número necesita su banda antes de ser una conclusión.

## Colores: usar los tokens, no hex sueltos

| Significado | Token |
|---|---|
| Dentro de la meta, cobertura OK | `--accent-green` |
| Atención, base floja | `--accent-amber` |
| Sobreconsumo, error | `--accent-red` |
| Ahorro, valor destacado | `--accent-cyan` |
| Sin datos, referencia | `--text-muted` |

**Leerlos con `getComputedStyle`**, no copiar el hex: si el token cambia, el gráfico lo sigue.

```js
const css = getComputedStyle(document.documentElement);
const verde = css.getPropertyValue('--accent-green').trim();
```

No agregar colores nuevos sin coordinarlos con `styles/`. En el hermano ya pasó lo contrario: un
`--accent-yellow` que **nunca se definió** renderizaba su color de fallback, distinto del resto de
los badges de estado, y un `#f5a623` crudo pintaba un tercer ámbar en la misma pantalla.

**El color nunca es el único canal.** Si el gráfico distingue estados, que además haya forma,
etiqueta o ícono: es la primera regla de accesibilidad y acá se aplica igual.

## Reglas de contenido

- **Todo gráfico declara su período**, igual que cualquier número (invariante 1). Un eje X sin
  decir de qué meses habla es un gráfico sin pasos.
- **Los puntos de base floja se muestran atenuados, no se ocultan.** En el hermano, los dos mixers
  con menos de 10 entregas van en gris: el dato existe, lo que no se sostiene es la conclusión.
- **Si el gráfico resume, tiene que decir cuántos quedaron afuera.** Un promedio de flota sin
  decir cuántos equipos entraron incumple la regla de siempre.
