# Fase 3 — Backup y restauración

**Fecha:** 18/09/2026 · Implementa PLAN4.md sección 6 y la pantalla F5 del prototipo de Fase 2.

## Qué se agregó

- `js/data/database.js`: `exportarBackup()`, `validarBackup()`, `importarBackup()`.
- `js/ui/backup.js`: modal de Backup y restauración, con exportar, elegir/soltar archivo,
  vista previa validada y restaurar con confirmación explícita.
- Botón nuevo en el header (junto a Re-analizar).
- Estilos en `styles/components.css`.

## Formato del archivo

```json
{
  "formatVersion": 1,
  "dbVersion": 14,
  "appVersion": "1.0.0",
  "exportedAt": "2026-09-18T12:00:00.000Z",
  "incluyeMovimientos": false,
  "stores": { "equipos": [...], "estimados": [...], "...": [...] }
}
```

## Qué se guarda, y qué no

`clearMovimientos()` ya borra `raw_records` y `files_meta` **cada vez que se abre la app**
(son datos de sesión, se regeneran re-subiendo los Excel). Por eso el backup, por defecto,
guarda solo lo persistente: maestro, metas, correcciones, seguimiento, referentes,
configuración y mapeos — 17 stores. "Incluir movimientos" es opcional, para el caso puntual de
llevar a otra computadora lo que ya está cargado hoy sin volver a subir los Excel.

## Reglas de restauración

- Un store que el backup **no trae** queda intacto (no se borra). Un backup viejo sin
  `referentesMeta`, por ejemplo, no borra los referentes ya elegidos en esta instalación.
- Un store que el backup trae pero la app no reconoce se ignora, sin bloquear el resto.
- Un backup de una versión de base de datos **más nueva** que la instalada se rechaza antes de
  tocar cualquier dato.
- Restaurar pide confirmación explícita (no se puede deshacer) y recarga la página al terminar.

## Verificación (18/09/2026)

Probado contra la app real (servida por HTTP, IndexedDB del navegador), no solo con datos de
prueba en Node:

| Prueba | Resultado |
|---|---|
| Exportar sin datos cargados | Descarga el `.json`, muestra "0 equipos" |
| Insertar un equipo → exportar → vaciar el store → restaurar | El equipo vuelve exactamente igual |
| `validarBackup(null)` | Rechazado: "no es un objeto JSON" |
| `validarBackup({dbVersion: 999, ...})` | Rechazado: versión más nueva que la instalada |
| `validarBackup({formatVersion: 2, ...})` | Rechazado: formato no soportado |
| Restaurar un backup que solo trae `equipos` | `referentesMeta` existente no se toca |
| Elegir un archivo de backup real en el modal (drag&drop simulado) | Vista previa correcta: nombre, fecha, cantidad de equipos |
| Restaurar sin confirmar el diálogo nativo | No pasa nada — los datos actuales quedan intactos |

No se automatizó el clic de "Aceptar" del `confirm()` nativo (limitación del navegador de
pruebas, no de la app); en cambio se verificó que sin confirmar, la restauración no ocurre —
que es la parte que importa probar.

Pendiente para un release: probar migración real desde una base v14 con datos reales de
producción (no solo sintéticos) antes del smoke test de Fase 6.
