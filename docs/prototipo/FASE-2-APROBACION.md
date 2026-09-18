# Fase 2 — Prototipo visual: registro de aprobación

**Fecha:** 18/09/2026
**Prototipo:** [`fase2.html`](fase2.html) — HTML estático, sin lógica de negocio, reutiliza los
estilos reales del proyecto (`styles/main.css`, `components.css`, `panel.css`) para que la
comparación con la app final sea directa.

## Contexto de esta aprobación

PLAN4.md pide una aprobación explícita del diseño antes de implementar las pantallas
definitivas. El usuario pidió ejecutar de corrido las Fases 1 a 6 en la misma sesión
("ejecuta Fase 1 con licencia MIT y continúa hasta la Fase 6"), sin una pausa intermedia. Este
documento dejа constancia de que el prototipo se construyó, se revisó visualmente (capturas
tomadas sirviendo el archivo por HTTP, con los estilos reales cargados) y se usó como base de
la Fase 3 en vez de esperar una aprobación humana en un paso aparte.

Si el resultado final de Fase 3/4 no coincide con lo esperado, este prototipo es el punto de
referencia para pedir cambios puntuales sin rehacer la pantalla entera.

## Pantallas cubiertas y su decisión de diseño

| Pantalla | Decisión tomada | Por qué |
|---|---|---|
| **Aviso de datos locales (F8)** | Tarjeta con lista de 4 puntos + botón "Entendido"; accesible también después desde el header | Corto, sin jerga técnica ("IndexedDB" no aparece en el texto visible), y no bloquea el flujo si el usuario ya lo vio |
| **Estado de IA (F6)** | Tres variantes del mismo panel (Local / No configurada / Remota) con una badge de color, no tres pantallas distintas | Es el mismo componente (`ai-panel`) con datos distintos; una sola implementación cubre los tres casos |
| **Backup y restauración (F5)** | Tres bloques verticales: último backup, exportar, restaurar. Restaurar pide confirmación explícita porque no se puede deshacer | Separar "cuándo fue el último backup" del botón de exportar evita que alguien exporte sin saber que ya tenía uno reciente |
| **Vista móvil (F7)** | Filtros colapsados a un botón con contador; IA como hoja inferior en vez de panel lateral fijo | En una pantalla angosta un panel lateral fijo de 350px deja menos espacio útil que el ancho de una tarjeta |

## Qué NO se prototipó (fuera del alcance de esta fase)

- El flujo completo de Carga de Datos (ya existe y no cambia).
- El detalle de equipo (ya existe y no cambia).
- La configuración de Ollama (modelo, URL) — se agrega directo en la implementación de la
  Fase 5 porque es un formulario simple sin decisiones de layout nuevas.
