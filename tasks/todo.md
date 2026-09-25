# Todo - actualizado el 25/09/2026

## Hecho (todo en main)

### Tanda 1 (24/09): tres arreglos de interfaz
- [x] T1 Alineacion de filas: panel.css, dispersion x = 0 medida
- [x] T2 Sin cartel falso al aceptar el ultimo equipo (panel.js: reabrir + abrirRevisarDecidir)
- [x] T3 Nota de resumenes de viaje en "Periodo analizado" (panel.js renderKPIs)

### Tanda 2 (24/09): alcance, persistencia y seguimiento
- [x] Tarjeta con doble contenido: sin scroll interno
- [x] Ventana de alcance (solo un tipo de equipo / meses completos), con chip "Quitar"
- [x] CM-42: Reclamar GPS, Marcar para seguimiento y Posibles acciones
- [x] Recargar ya no vacia cargas ni GPS; boton dedicado "Vaciar datos"
- [x] Service Worker v3

### Tanda 3 (25/09): identidad y correccion a mano
- [x] GR01 -> GE01 por evidencia (lugar de carga / centro de costo), con Deshacer
- [x] Patente doble (MX59, BM14) unificada, con Deshacer
- [x] LIMPIEZA / CALDERA escritos con su nombre, resueltos por sede
- [x] Patente sin interno con centro de costo: aceptada sola (5 casos)
- [x] Botones "Corregir a mano" y "Corregir patente"; modal de patente doble acotado
- [x] Se quita el aviso "no figuran en Cargas"
- [x] KPI Equipos: "por identificar" / "ya resueltos"
- [x] Botones de correcciones automaticas alineados en columna fija
- [x] Service Worker v5: red primero para JS y CSS
- [x] Verificado: npm test 290/290, importacion, declarados, unidades, auditar y verificar en verde
- [x] CLAUDE.md actualizado; _datos_prueba/ borrado

## Pendiente (nada urgente)
- [ ] Servicios de planta (CA, CL, LM, MT) siguen en "cargan combustible sin dato de actividad": decidir si salen de ahi o se les pide horas declaradas
- [ ] `chk-limpiar` ("Reemplazar los movimientos ya cargados") sigue tildado por defecto: cambiarlo es decision del usuario
- [ ] `Resumen de viaje.xlsx` de CM-42 dice 63 km y el mensual ~4.540: confirmar con el proveedor del GPS
- [ ] `actividadImplicita()` sin tests; 6 mutaciones menores de `utilizacion()` documentadas en CLAUDE.md
- [ ] Patentes reales dentro de los fixtures de tests (exposicion preexistente)
- [ ] Ramas viejas ya fusionadas en GitHub y `suite-de-tests` local: borrar cuando se quiera
