---
name: flotacontrol-nueva-vista
description: >
  Aplicar al crear un archivo nuevo en js/ui/ o agregar una pestaña al panel de este repo
  (NEW-APP). Contiene el patrón obligatorio para que la vista se integre sin duplicar lógica,
  y el estado actual de la navegación.
---

# Vista nueva — patrón obligatorio

## Cómo está hoy la navegación

Este repo tiene **tres vistas**, registradas en `js/app.js` → `irA(vista)`:

| Vista | id | Render |
|---|---|---|
| Carga de Datos | `upload` | `initUploadUI` / `renderDBStatus` |
| Panel | `panel` | `renderPanel()` |
| Base de Datos | `datos` | `renderDataTable()` |
| Seguimiento | `seguimiento` | `renderSeguimiento()` |

El repo hermano tiene además **Rendimiento** (L/m³ por mixer), que acá **no existe**. Portarla
no es copiar el archivo: hace falta `alinearCargasYEntregas()` y vendorizar Chart.js. Ver la
deuda en `CLAUDE.md`.

## Los seis pasos

1. **Un archivo en `js/ui/`** que exporta `renderXxx(container, analisis)`.
2. **Registrarla en `js/app.js`**: el botón en `.app-nav`, la sección `#view-xxx` en
   `index.html`, y la línea en `irA()`.
3. **Copiar el helper `esc()`** al inicio del archivo — no importarlo. La convención del proyecto
   es duplicarlo literal (ver la skill de reglas de negocio, sección XSS).
4. **Registrar cada cálculo** con `registrarCalculo(id, { titulo, valor, pasos, fuentes, acciones })`
   si el número va a ser clickeable. **Nunca un número sin sus pasos a la vista.**
5. **Publicar `window.renderXxx`** solo si tiene que ser abrible desde el panel de diagnóstico.
6. **Agregar un grupo a `tools/auditar-declarados.mjs`** si la vista tiene lógica pura (mediana,
   cobertura, agregación) que se pueda probar sin Excel ni IndexedDB. Ese arnés corre en CI y es
   instantáneo.

## Qué NO hacer

- **No importar `database.js` directamente** si podés recibir `analisis` como parámetro. Una
  vista que se construye con datos ya procesados se puede probar; una que va a buscarlos sola, no.
- **No reimplementar `mediana()`, `coberturaEquipo()`, `utilizacion()` ni `confiabilidad()`.**
  Se importan de `diagnostico.js` (invariante 2). Ya hubo dos bugs por reescribir la mediana.
- **No agregar almacenamiento propio** salvo que la vista sea la dueña natural del dato. Si hace
  falta persistir, se agrega un store en `database.js` con su comentario de versión y su
  justificación escrita. El `onupgradeneeded` **solo agrega** stores: no hay migración para
  renombrar o transformar un campo existente.
- **No publicar una razón sin su período y su base.** Si la métrica es una tasa, pasa por
  `confiabilidad()` y se atenúa cuando la base es floja (invariante 3).

## Antes de darla por terminada

```bash
npm run probar
```

Y abrirla en el navegador con datos reales (`preview_start` con `name: "limpio"`, snippet de
carga en `CLAUDE.md`). Un arnés no ve una tarjeta rota ni un botón sin estilo.

Caso real del hermano: dos botones nuevos salieron blancos con texto negro sobre el tema oscuro
porque llevaban `class="btn-sm"` sin ninguna clase base de color — `.btn-sm` define tamaño, no
color. Se ve en un segundo en el navegador y en ningún arnés.
