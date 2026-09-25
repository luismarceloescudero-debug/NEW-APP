# Plan: segunda vuelta de pedidos (24/09/2026)

Base: rama arreglos-interfaz-panel (8882215). Rama nueva para este lote: alcance-persistencia-y-seguimiento.

## Pedidos del usuario -> decision de diseno

| # | Pedido | Decision |
|---|---|---|
| 3 | Tarjeta con "doble contenido" y scroll en "Elegir cuales de los 10 equipos..." | Quitar el scroll interno (`max-height`/`overflow` de `.diag-lista-bajo-promedio`): un solo scroll, el de la pagina |
| 4a | Si subo solo agosto y solo camionetas: ventana emergente para elegir "solo camionetas, agosto" o "descartar y alinear ene-ago, todos los equipos, meses completos" | Modulo puro `js/data/alcance.js` (detectar + filtrar, con tests). Ventana al procesar; la decision se guarda en `config`. Chip visible "Alcance: ..." con "Quitar" |
| 4b | CM-42: boton de accion / reclamar GPS con la diferencia, marcar para seguimiento, posibles acciones | En filas de `resumen_vs_flota` con diferencia: "Reclamar GPS" (motivo con la diferencia), "Marcar para seguimiento" (abre "Estado" con el detalle precargado, se guarda en la base), y "Posibles acciones" (CONSEJOS) |
| 4c | Recargar no debe vaciar cargas/GPS; usar boton dedicado | Sacar `clearMovimientos()` de `app.js` al iniciar. El boton dedicado ya existe: "Re-analizar" |
| 4d | Lo marcado/corregido pasa a ser persistente | Reclamos y "Estado" ya viven en la base; con 4c los movimientos tambien. El "ojito" de la tarjeta es de sesion: se deja el "Estado" como marca persistente |
| 4e | Septiembre fuera del periodo, solo meses completos | Ya es asi (`mesesCompletosDeFuente`). Sin cambios |

## Decisiones que NO se cambian sin avisar
- `chk-limpiar` ("limpiar antes de procesar") sigue tildado: cambiar ese default puede sumar un Resumen de
  Flota regenerado a la version vieja y duplicar km/horas. Solo se aclara el texto.

## Verificacion
- Tests unitarios de `alcance.js` (puro): deteccion y filtrado.
- Navegador: reproducir con las planillas reales; recargar y comprobar que los datos siguen.
- `npm run probar` completo: numeros identicos.
