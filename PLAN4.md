# PLAN4 — FlotaControl: tipo de app, arquitectura y camino a producción gratuita

**Fecha de referencia:** 18/09/2026
**Reemplaza a:** PLAN3.md (mantiene sus decisiones y las cierra con las restricciones reales).
**Restricciones fijas:**

- Repositorio **público** en GitHub gratuito.
- Hosting gratuito.
- Sin suscripción paga de Vercel, GitHub ni Claude.
- Los datos de la flota no pueden salir del equipo sin que el usuario lo decida.

---

## 1. Decisión: qué tipo de app conviene

**FlotaControl debe ser una PWA local-first, estática y sin backend propio.**

PWA significa *Progressive Web App*: una página web que se puede instalar como app y funciona sin conexión.

| Opción | ¿Sirve acá? | Motivo |
|---|---|---|
| **PWA estática local-first** | **Sí, recomendada** | Procesa los Excel en el navegador y los datos quedan en la PC. Hosting gratis, sin servidor que mantener y sin costo por uso. |
| SPA con backend y base de datos (Express, Supabase, etc.) | No, por ahora | Los datos de flota saldrían a un servidor. Además habría que poner login, cuidar la base y respetar las cuotas del plan gratuito. Solo se justifica si varias personas tienen que ver **los mismos datos al mismo tiempo**. |
| App de escritorio (Electron/Tauri) | No | Suma empaquetado, firma y actualizaciones sin ganar nada que la PWA no dé. |
| App móvil nativa | No | El trabajo es de escritorio (planillas). En el celular alcanza con la vista responsive. |
| Migrar a React/Vue | No, por ahora | El código actual (ES modules sin framework, unos 20 módulos) es manejable. Migrar ahora es riesgo sin beneficio. Conviene revisarlo si la UI supera unas 3–4 pantallas más. |

**Por qué descarto el backend Express con `/historial`:** el historial ya vive en IndexedDB. Llevarlo a un servidor público implica:

- sacar datos operativos de la empresa a internet;
- poner autenticación real;
- tener una base persistente, que Vercel gratuito no trae (sus funciones no guardan estado).

Todo eso para resolver algo que hoy no es un problema. Si más adelante hace falta compartir datos entre personas, se decide en la Fase 7.

---

## 2. Arquitectura final

```text
GitHub (repo público: solo código, nunca datos)
   │  push a main
   ▼
GitHub Actions ──► GitHub Pages (hosting estático gratuito, HTTPS)
                        │
                        ▼
              Navegador del usuario (PWA instalada)
              ├── Frontend: HTML + CSS + ES modules (sin framework)
              ├── Service Worker: funciona sin internet
              ├── SheetJS: lee los .xlsx localmente
              ├── Motor de cálculo (analyzer, normalizer, autocorrección)
              ├── IndexedDB: maestro, cargas, correcciones, seguimiento, metas
              ├── Backup/Restore: archivo .json que el usuario guarda donde quiera
              └── IA (opcional)
                   ├── Ollama en la misma PC ◄── el navegador le habla directo
                   └── (futuro) IA remota vía función serverless con clave propia
```

### Qué es cada pieza y dónde vive

| Capa | Tecnología | Dónde corre | Costo |
|---|---|---|---|
| Frontend | HTML/CSS/JS ES modules (lo actual) | Navegador | 0 |
| Instalable/offline | `manifest.webmanifest` + `sw.js` | Navegador | 0 |
| "Base de datos" | IndexedDB (v14 actual) | Navegador | 0 |
| Backup | Export/Import JSON versionado | PC del usuario (o su OneDrive/Drive) | 0 |
| Backend | **Ninguno** para el núcleo | — | 0 |
| IA | Ollama local, llamado desde el navegador | PC del usuario | 0 |
| Hosting | GitHub Pages (el workflow `pages.yml` ya existe) | GitHub | 0 |
| CI | GitHub Actions: sintaxis + arneses sin datos | GitHub | 0 (repos públicos) |

### Hosting: GitHub Pages primero, Vercel no por ahora

- **GitHub Pages** alcanza para una app 100 % estática. Ya está configurado en `.github/workflows/pages.yml` y es gratis en repos públicos.
- **Vercel Hobby** es para uso **personal y no comercial**. Una herramienta interna de HSV Logística es uso comercial, así que no conviene apoyarse ahí.
  - Además, lo único que Vercel agregaría es `/api/chat`.
  - Con Ollama, esa función **no sirve**: el servidor de Vercel no puede llegar al `127.0.0.1` de tu PC.
- Si en el futuro se necesita una función serverless gratuita con uso comercial permitido, la alternativa es **Cloudflare Pages + Workers**, en su plan gratuito (Fase 7).
- **Un solo hosting.** Tener la misma app en dos URLs divide los datos, porque IndexedDB es por dominio, y confunde.

---

## 3. Consecuencias de que el repo sea público

1. **Nunca datos.** El `.gitignore` ya bloquea `.xlsx`, `.csv`, `.env` e `invariantes.json`. Revisé el primer commit (`dd6a93f`, 44 archivos) y está limpio. Se mantiene así con un chequeo en CI (Fase 1).
2. **El historial de git es permanente.** Si alguna vez se sube una planilla, borrarla en un commit posterior **no alcanza**: hay que reescribir el historial y dar el dato por expuesto.
3. **Las reglas de negocio quedan visibles** (prefijos, denominaciones, fórmulas). Hay que aceptarlo o sacar lo sensible a un archivo de configuración que se carga localmente. Recomendación: aceptarlo; son reglas operativas, no secretos.
4. **La licencia hoy es contradictoria.** "Uso interno — HSV Logística" en un repo público no impide que lo lean.
   - Opción a: sin licencia (todos los derechos reservados; se puede ver pero no reutilizar).
   - Opción b: MIT.
   - Hay que decidirlo en la Fase 1.
5. **`APP_SECRET_VALUE` en el frontend no protege nada** en un repo público. Se elimina junto con el flujo remoto (ver sección 5).

---

## 4. Frontend

Se mantiene el stack actual. Los cambios concretos son:

| # | Cambio | Motivo |
|---|---|---|
| F1 | `manifest.webmanifest` + iconos | Se instala como app en Windows/Android |
| F2 | `sw.js` con caché versionada de `index.html`, `js/`, `styles/` y `xlsx.full.min.js` | Funciona sin internet; la actualización se controla con la versión |
| F3 | Traer FontAwesome al repo (hoy viene de CDN) | Sin dependencias externas y compatible con CSP |
| F4 | `Content-Security-Policy` por `<meta>` | Pages no permite headers propios; `connect-src 'self' http://127.0.0.1:11434` |
| F5 | Pantalla **Backup y restauración** | Hoy perder el navegador es perder las correcciones |
| F6 | Indicador de estado de IA: Local / No configurada | Pedido en PLAN3 |
| F7 | Vista móvil: filtros en botón, IA como hoja inferior | Pedido en PLAN3 |
| F8 | Aviso visible de "los datos quedan en este navegador" | Expectativa clara para el usuario |

**Regla que se mantiene:** F5–F8 se prototipan y aprueban visualmente (HTML estático sin lógica) **antes** de implementarlas.

---

## 5. Backend e IA

### Núcleo: sin backend
El cálculo, la importación y la persistencia no dependen de ningún servidor.

### IA local (la que se implementa)
El navegador llama **directo** a Ollama en `http://127.0.0.1:11434`. No pasa por `/api/chat`.

Requisitos que la app debe explicar en pantalla:

- Ollama instalado y un modelo descargado (`ollama pull qwen3:8b`).
- Permitir el origen del sitio. En Windows, variable de entorno de usuario:
  `OLLAMA_ORIGINS=https://luismarceloescudero-debug.github.io`
- Chrome/Edge pueden pedir permiso de "acceso a la red local" la primera vez. Hay que aceptarlo.
- Si Ollama no responde: "IA no configurada" y la app sigue funcionando.

Cambios de código:

- `js/ai/chat.js` pasa a tener un adaptador `OllamaProvider`, con `isAvailable()`, `listModels()`, `chat()` y streaming.
- Se envía solo el resumen necesario, nunca las planillas completas.

### IA remota (queda congelada)
`api/chat.js` pasa a `extras/remote-chat/` o se borra. Si algún día se activa, las condiciones son:

- Hosting con funciones y uso comercial permitido (Cloudflare Workers gratis).
- **Clave de acceso real:** una contraseña guardada solo como variable de entorno del servidor. El usuario la tipea y queda en `sessionStorage`. Nunca en el repo.
- Tope de gasto configurado en la consola de Anthropic.
- Aviso previo de qué datos se envían.

---

## 6. Datos

| Tema | Decisión |
|---|---|
| Almacenamiento | IndexedDB (DB v14), se mantiene |
| Persistencia | Pedir `navigator.storage.persist()` para que el navegador no borre los datos por espacio |
| Backup | JSON `{formatVersion, dbVersion, appVersion, exportedAt, stores}` (formato de PLAN3) |
| Qué incluye | Maestro, metas, correcciones, seguimiento, referentes, configuración, mapeos, disponibilidad. Los movimientos son opcionales porque se regeneran desde los Excel |
| Restauración | Transaccional: valida versión y, si falla, no toca nada |
| Compartir entre PCs | Por archivo de backup (OneDrive/Drive/pendrive). Sin servidor |
| Recordatorio | Aviso si pasaron más de 7 días sin backup |

---

## 7. Fases

### Fase 0 — Desbloqueo de datos (obligatoria, heredada de PLAN3)
- Identificar las **58 filas y 9.166,4 L** de diferencia en `npm run verificar`.
- Comparar hashes de `Cargas_Combustible_HSV_2026.xlsx` (modificado el 14/09) contra la versión usada el 11/09.
- Recién con la causa justificada: `npm run verificar:actualizar`.
- **Salida:** `npm run probar` en verde.

### Fase 1 — Repo público seguro y primer deploy
- Decidir la licencia (sección 3.4) y actualizar README.
- Borrar `js/config/appSecret.js` y el header `X-App-Secret` del frontend.
- Mover `api/chat.js` fuera del deploy. Borrar `vercel.json`, o dejarlo si se descarta Vercel.
- Agregar un workflow de CI (`.github/workflows/ci.yml`) que haga:
  - `node --check` de todos los `.js`/`.mjs`;
  - que falle si se versiona cualquier `.xlsx`, `.csv`, `.env` o `invariantes.json`.
- `git remote add origin https://github.com/luismarceloescudero-debug/NEW-APP.git` y `git push -u origin main`.
- En GitHub: *Settings → Pages → Source: GitHub Actions*.
- **Salida:** la app abre en `https://luismarceloescudero-debug.github.io/NEW-APP/` y procesa las planillas localmente.

> Ojo: Pages sirve la app bajo `/NEW-APP/`. Todas las rutas del frontend tienen que ser relativas (`./js/...`, no `/js/...`). Hay que verificarlo antes del primer deploy.

### Fase 2 — Prototipo visual (sin lógica)
- Backup/restauración, estado de IA, vista móvil, aviso de datos locales.
- **Salida:** aprobación explícita del diseño.

### Fase 3 — Backup y restauración (F5 + sección 6)
- **Salida:** exportar → borrar datos del sitio → importar → mismos números en panel y arneses.

### Fase 4 — PWA (F1–F4, F8)
- **Salida:** se instala y abre sin internet. Una versión nueva se activa al recargar. Sin errores de CSP en consola.

### Fase 5 — IA local directa (sección 5)
- **Salida:** con Ollama, el chat responde. Sin Ollama, se ve "IA no configurada" y no hay errores.

### Fase 6 — Release 1.0
- `npm run probar` en verde.
- Smoke test en escritorio y celular.
- Reimportar sin duplicados.
- Prueba sin conexión.
- Tag `v1.0.0`. **Rollback:** `git revert` + push (Pages redeploya solo).

### Fase 7 — Solo si aparece la necesidad (no planificada)
- Varias personas con los mismos datos en tiempo real → evaluar un backend con base (Supabase o Cloudflare D1, gratis) **con login real**. Implica que los datos salen de la PC y hay que decidirlo explícitamente.
- IA remota → sección 5, "IA remota".
- Tabulator/Chart.js → solo con una decisión operativa concreta que lo justifique.

---

## 8. Definición de listo

- Abre desde una URL gratuita y también instalada, con y sin internet.
- No hay datos de la flota en el repo ni en ningún servidor.
- Los tres arneses pasan con archivos identificados.
- Backup y restauración probados en un navegador limpio.
- La IA es opcional, local y no rompe nada si falta.
- No hay secretos en el frontend.

---

## 9. Registro de ejecución

### Fase 0 — 18/09/2026 · completada

Detalle en [`docs/FASE-0-DATOS.md`](docs/FASE-0-DATOS.md). El informe por fila queda fuera del repo, en `CONSUMO DE COMBUSTIBLE/referencia/`.

- **+58 filas / +9.166,4 L:** la planilla de Cargas se actualizó el 14/09 con cargas del 10/09 al 15/09. Es un cambio de datos, no de código. Queda un residuo de 7,5 L por la edición de una fila anterior, que no se puede identificar.
- **189 → 178 equipos:** era código pegado el 17/09 en `analyzer.js` y `panel.js`. Ocultaba 11 equipos, inflaba los KPIs del panel y rompía la vista Seguimiento. Se eliminó.
- **El arnés no lo detectaba:** `verificar` ahora controla los KPIs del panel y su coherencia interna antes de permitir `--actualizar`.
- **Referencia nueva:** se generó fuera del repo con el código corregido. La vieja y una copia de la planilla quedaron congeladas al lado.
- **`npm run probar`:** los tres arneses en verde.
