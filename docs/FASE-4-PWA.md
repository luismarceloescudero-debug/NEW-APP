# Fase 4 — PWA: instalable, sin conexión, CSP, sin CDN externo

**Fecha:** 18/09/2026 · Implementa F1–F4 y F8 del prototipo de Fase 2.

## Qué se agregó

| # | Archivo | Qué hace |
|---|---|---|
| F1 | `manifest.webmanifest` | Nombre, ícono, colores; permite "Instalar"/"Agregar a inicio" |
| F1 | `icons/*.png` | Generados con `tools/generar-iconos.cjs` (PNG escrito a mano, sin librerías ni CDN) |
| F2 | `sw.js` | Service worker: cachea el frontend para uso sin conexión, registrado desde `js/app.js` |
| F3 | `vendor/fontawesome/` | Font Awesome 6.4.0 vendorizado con `tools/vendorizar-fontawesome.cjs` (antes: CDN de cdnjs) |
| F4 | CSP por `<meta>` en `index.html` | Ver detalle abajo |
| F8 | `js/ui/aviso.js` | Aviso "tus datos quedan en esta computadora", una vez y reabrible desde el header |

## Content-Security-Policy

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
font-src 'self';
img-src 'self';
connect-src 'self' http://127.0.0.1:* http://localhost:* https://127.0.0.1:* https://localhost:*;
object-src 'none';
base-uri 'self';
form-action 'self';
```

- **`script-src 'self'` sin `'unsafe-inline'`**: se pudo dejar así de estricto porque, al revisar,
  la app no tenía ningún `<script>` inline — solo quedaban 7 atributos `onclick=`/`onchange=`
  (2 en `index.html`, 2 en modales, y **3 que eran restos de código roto** de la sesión del
  17/09: un `<select id="selector-periodo">` y otro `id="selector-consumo"` que llamaban a
  `cambiarPeriodo()`/`actualizarConsumo()` — funciones que no existen en ningún lado — y un
  botón que llamaba a `generarMD()`, que la Fase 0 ya había borrado. Se sacaron los tres junto
  con los otros cuatro, que se reemplazaron por `addEventListener`.
- **`style-src` sí lleva `'unsafe-inline'`**: la app usa `style=""` extensamente (10 archivos).
  Sacarlo es un riesgo mucho menor que scripts inline y reescribirlo todo a clases quedó fuera
  de alcance de esta fase.
- **`connect-src` incluye `127.0.0.1`/`localhost` en cualquier puerto**: para que el asistente
  (Fase 5) le hable directo a Ollama sin backend intermedio.
- **`frame-ancestors` no se puede fijar por `<meta>`** (solo por header HTTP) — GitHub Pages no
  permite headers propios, así que esa protección puntual queda fuera de alcance.

## Font Awesome vendorizado

Se instaló `@fortawesome/fontawesome-free@6.4.0` (**la misma versión exacta** que ya se usaba
desde cdnjs, para cero regresiones de íconos) como devDependency, y `tools/vendorizar-fontawesome.cjs`
copia a `vendor/fontawesome/` solo lo que la app usa: `fontawesome.min.css` + `solid.min.css` +
la tipografía solid (woff2/ttf) — la app usa únicamente el estilo `fa-solid` (se verificó con
`grep -roh 'fa-\(solid\|regular\|brands\)'`). 625 KB en vez de los ~2,5 MB de los cuatro estilos
completos.

## Service worker

Cachea 38 archivos en la instalación (`PRECACHE` en `sw.js`) y, además, cualquier otro pedido
del mismo origen que la app haga se cachea la primera vez que se pide con éxito — para que un
archivo nuevo que se olvide agregar a la lista igual quede disponible offline después de la
primera visita online. Navegación (abrir la URL, F5): red primero, con la página cacheada como
respaldo. Todo lo demás: caché primero. `CACHE_VERSION` hay que subirla a mano en cada release
para invalidar el caché viejo.

## Verificación (18/09/2026)

Contra la app real, servida por HTTP:

| Prueba | Resultado |
|---|---|
| Consola al cargar | Sin errores ni warnings (incluido el de `frame-ancestors`, corregido) |
| Service worker | Registrado y `activated` |
| Caché del service worker | 38/38 archivos esperados presentes |
| `manifest.webmanifest` | JSON válido, con los 3 íconos declarados |
| Íconos PNG | Válidos (`icon-512.png` e `icon-maskable-512.png` verificados visualmente) |
| Font Awesome vendorizado | Los íconos se ven igual que antes (logo, header, modales) |
| Botón "Seleccionar Archivos" (ex `onclick` inline) | Sin errores de consola tras el cambio a `addEventListener` |
| Botón "Exportar" de Base de Datos (ex `onclick` inline) | Ejecuta `exportarTablaVisible()` correctamente (mensaje "No hay datos para exportar" con la base vacía) |
| Cerrar modales de Backup/Configuración (ex `onclick` inline) | Funciona con el nuevo `addEventListener` |
| `npm run declarados` | OK, 101 chequeos |

No se pudo forzar "modo avión" real en el navegador de pruebas de esta sesión (herramienta sin
ese control); la cobertura offline se validó indirectamente confirmando que el Cache Storage
tiene los 38 archivos y revisando la lógica de `sw.js`. Recomendado como parte del smoke test
manual de la Fase 6: DevTools → Network → Offline → recargar.

También pendiente para la Fase 6: confirmar visualmente el panel con datos reales cargados
(las funciones que se tocaron en `panel.js` para sacar el código muerto no se ejercitan con la
base vacía).
