# FlotaControl — Control local de consumo de combustible

FlotaControl es una aplicación web **local-first** para analizar la flota: se puede instalar
(PWA) y funciona sin internet. El frontend procesa las planillas en el navegador y guarda el
trabajo en IndexedDB. No tiene backend propio; no necesita GitHub, Vercel ni ningún servidor
para funcionar.

Los archivos reales de la flota no forman parte de este repositorio y nunca deben subirse a GitHub.
La IA es opcional: sin proveedor configurado, el análisis local sigue funcionando.

## Cómo funciona

Se cargan cuatro planillas y la app las cruza entre sí:

| Planilla | Aporta | Clave de cruce |
|---|---|---|
| `Equipos HSV*.xlsx` | Padrón: interno, dominio, marca, modelo | `INTERNO` |
| `Cargas_Combustible_*.xlsx` | Litros, costo, lugar, centro de costo, chofer | `INTERNO-DOMINIO` |
| `Resumen de Flota*.xlsx` (GPS) | Km recorridos, horas de ralentí y de movimiento | `UNIDAD` |
| `Consumos Estimados*.xlsx` | Meta de consumo **y su unidad** (L/hora o L/100km) | `INTERNO` |

El cruce se hace por una **clave normalizada** del interno: `TR-21`, `TR 21` y `TR21` se
tratan como el mismo equipo.

### Cómo se decide L/Hora vs L/100Km

Por la **unidad declarada en Consumos Estimados**, que es la fuente de verdad del área
(ej. `8 L/hora` → se mide por hora; `9,5 L/100km` → se mide por distancia).
Si un equipo no tiene meta cargada, se cae a una regla por prefijo de interno.
Se puede sobrescribir a mano desde la tarjeta del equipo.

### Denominaciones

La columna `TIPO` del Excel de Equipos tiene valores inconsistentes (los TR figuran como
"CAMION" siendo tractores). La app usa una denominación canónica según el prefijo del interno:

`AE` Autoelevador · `AU` Automóvil · `BA` Batea · `BM` Bomba · `CF` Cargadora frontal ·
`CH` Camión hidrogrúa · `CL` Caloventor · `CM` Camioneta · `CR` Carretón · `EX` Excavadora ·
`FG` Furgón · `GE` Grupo electrógeno · `MC` Minicargadora · `MH` Productora de hielo ·
`MS` Semi mixer · `MT` Motocompresor · `MX` Mixer · `RE` Retrocargadora · `SR` Semirremolque ·
`TO` Tolva · `TP` Topador · `TR` Tractor · `VL` Volcador

## Uso

1. Abrir la app (ver *Desarrollo local* o la URL desplegada).
2. Ir a **Carga de Datos**, arrastrar las cuatro planillas (se pueden subir varios
   "Resumen de Flota" para abarcar más meses).
3. **Procesar y Analizar** → la app salta al **Panel de Flota**.

En el panel están juntos los indicadores globales y las tarjetas por equipo, con filtros por
denominación, estado y orden. Cada tarjeta es editable (denominación, meta y unidad) y abre un
detalle con el desglose del cálculo, las últimas cargas y la actividad GPS.

**Re-analizar** (arriba a la derecha) borra los datos guardados en el navegador y deja todo
listo para reprocesar. Es necesario cuando quedaron datos de una versión anterior de la app,
porque reprocesar sin limpiar duplicaría litros, km y horas.

## Instalar y usar sin conexión

FlotaControl es una PWA (Progressive Web App): el navegador ofrece "Instalar" o "Agregar a
pantalla de inicio" (el ícono suele aparecer en la barra de direcciones). Una vez instalada:

- Abre en su propia ventana, como una aplicación.
- Funciona sin internet después de la primera visita (`sw.js` cachea el frontend).
- Se actualiza sola la próxima vez que se abre con conexión.

No es necesario instalarla para usarla: abrir la URL en el navegador funciona igual.

## Desarrollo local

`index.html` carga los módulos como ES modules, así que **no funciona abriéndolo con doble
clic** (`file://`): el navegador bloquea los módulos por CORS. Hay que servirlo por HTTP:

```bash
npm run dev                     # abrir http://localhost:8080
```

También funciona cualquier servidor estático, por ejemplo `python -m http.server 8080`.

Para el asistente IA hace falta Ollama corriendo en la misma computadora (ver "Asistente de
IA" más abajo). El núcleo de FlotaControl sigue funcionando aunque Ollama no esté instalado.

## Pruebas

La suite de unit tests no necesita ninguna planilla: son las funciones puras de `js/data/` y
`js/parsers/` contra el contrato que tienen escrito. Corre en unos pocos segundos.

```bash
npm install
npm test
```

## Verificación de datos

Las planillas reales deben estar fuera del repo. Los arneses aceptan la ruta mediante
`FLOTACONTROL_ARCHIVOS`. La referencia numérica de producción también debe permanecer fuera del
repo y se indica mediante `FLOTACONTROL_INVARIANTES`.

PowerShell:

```powershell
$env:FLOTACONTROL_ARCHIVOS = 'C:\ruta\a\ARCHIVOS'
$env:FLOTACONTROL_INVARIANTES = 'C:\ruta\privada\invariantes.json'
npm install
npm run declarados
npm run verificar
npm run auditar
```

Git Bash:

```bash
export FLOTACONTROL_ARCHIVOS="/c/ruta/a/ARCHIVOS"
export FLOTACONTROL_INVARIANTES="/c/ruta/privada/invariantes.json"
npm install
npm run declarados
npm run verificar
npm run auditar
```

Los tres comandos deben terminar con código `0`. No ejecutar `verificar:actualizar` para tapar
una diferencia no explicada.

`npm run probar` encadena los seis (`npm test` primero, después los cinco arneses) y es lo que
conviene correr antes de commitear cualquier cambio en `js/data/` o `js/parsers/`.

La guía de publicación está en `docs/DEPLOYMENT.md` y la de pruebas en `docs/PRIMERA-FASE.md`.

## Asistente de IA

El asistente corre con [Ollama](https://ollama.com) en la misma computadora: el navegador le
habla directo, sin backend, sin API key y sin enviar datos de la flota a ningún servidor. Si
Ollama no está instalado o no responde, la app muestra "IA no configurada" y el resto sigue
funcionando igual — la IA nunca es requisito para analizar la flota.

El asistente tiene acceso al resumen de la flota y al detalle de cualquier equipo bajo demanda
(tool `get_equipo_detalle`, resuelta contra el IndexedDB local). No hay búsqueda web en este
release: un modelo local no puede salir a internet por su cuenta.

Ver `docs/DEPLOYMENT.md` para instalar Ollama y habilitar el origen del sitio.

Un backend con un proveedor remoto (Claude/Anthropic) quedó documentado pero sin desplegar en
`extras/remote-chat/`.

## Despliegue

FlotaControl es 100% estática: cualquier hosting de archivos sirve. El principal es **GitHub
Pages**, gratuito en repos públicos (workflow `.github/workflows/pages.yml`). Se evaluó y se
descartó Vercel como opción principal por su límite de uso no comercial. Detalle completo,
incluyendo cómo habilitar Ollama contra un sitio publicado, en `docs/DEPLOYMENT.md`.

## Estructura

```
index.html               Página única (Carga de Datos + Panel de Flota)
manifest.webmanifest     Metadatos de instalación (PWA)
sw.js                    Service worker: caché para uso sin conexión
xlsx.full.min.js         SheetJS, servido localmente (no desde CDN)
vendor/fontawesome/      Font Awesome vendorizado (no desde CDN) — ver tools/vendorizar-fontawesome.cjs
icons/                   Íconos de la PWA — ver tools/generar-iconos.cjs
js/app.js                Arranque, navegación, botón Re-analizar, registro del service worker
js/data/normalizer.js    Normalización, denominaciones, parseo de horas y metas
js/data/analyzer.js      Reglas de negocio y análisis de toda la flota
js/data/database.js      IndexedDB + backup/restauración (exportarBackup/importarBackup)
js/parsers/              Detección de formato y extracción de cada planilla
js/ui/panel.js           Panel unificado (KPIs + tarjetas editables)
js/ui/datatable.js       Visor/editor de tablas
js/ui/modals.js          Detalle por equipo
js/ui/backup.js          Modal de backup y restauración
js/ui/aviso.js           Aviso de "tus datos quedan en esta computadora"
js/ai/chat.js            Cliente del asistente (UI, resumen de contexto)
js/ai/ollama.js          Adaptador de Ollama (fetch directo, sin backend)
extras/remote-chat/      Backend remoto (Claude/Anthropic) documentado, sin desplegar
```

## Licencia

Código bajo licencia MIT (ver `LICENSE`). No cubre datos operativos de flota, planillas ni
reglas comerciales internas de HSV Logística: ese contenido nunca forma parte de este
repositorio (ver `.gitignore`).
