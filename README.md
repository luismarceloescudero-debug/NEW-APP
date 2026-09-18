# FlotaControl — Control local de consumo de combustible

FlotaControl es una aplicación web **local-first** para analizar la flota. El frontend procesa
las planillas en el navegador y guarda el trabajo en IndexedDB. El núcleo no necesita backend,
GitHub ni Vercel para funcionar.

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

## Desarrollo local

`index.html` carga los módulos como ES modules, así que **no funciona abriéndolo con doble
clic** (`file://`): el navegador bloquea los módulos por CORS. Hay que servirlo por HTTP:

```bash
npm run dev                     # abrir http://localhost:8080
```

El servidor local sirve el frontend y también monta `/api/chat`, por lo que permite probar Ollama
sin instalar Vercel CLI. Si solo se quiere servir el frontend, también funciona `python -m
http.server 8080`, pero el chat no estará disponible.

Para IA sin cuota de proveedor se puede usar Ollama en la computadora. El núcleo de FlotaControl
sigue funcionando aunque Ollama no esté instalado.

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

La guía de publicación está en `docs/DEPLOYMENT.md` y la de pruebas en `docs/PRIMERA-FASE.md`.

## Asistente de IA

La IA remota usa Claude a través de una función serverless en `api/chat.js`. La API key vive
únicamente en una variable de entorno del hosting, nunca en el navegador. La suscripción de
Claude.ai no sustituye una API de Anthropic y la API remota se factura por uso.

La IA local mediante Ollama no necesita una API paga ni envía datos fuera del equipo. Para usarla
con el chat integrado, el backend local se configura con `AI_PROVIDER=ollama`.

El asistente tiene acceso real al resumen de la flota y al detalle de cualquier equipo bajo
demanda (tool `get_equipo_detalle`). La búsqueda web solo está disponible con Anthropic y tiene
costo aparte por búsqueda.

## Despliegue

### GitHub Pages

El workflow `.github/workflows/pages.yml` publica solo el frontend estático. El núcleo funciona,
pero GitHub Pages no ejecuta `/api/chat`; la IA remota queda deshabilitada.

### Vercel

Vercel puede servir el frontend y ejecutar `api/chat.js`. Requiere variables de entorno y no debe
considerarse autenticación por sí solo. Las características del plan gratuito pueden cambiar; la
aplicación no depende de ellas para conservar datos ni calcular.

Variables remotas: `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY`, `APP_SHARED_SECRET`,
`ANTHROPIC_MODEL` y `ANTHROPIC_MAX_WEB_SEARCHES`. Para Ollama local: `AI_PROVIDER=ollama`,
`OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `OLLAMA_KEEP_ALIVE` y opcionalmente `OLLAMA_NUM_CTX`.

## Estructura

```
index.html              Página única (Carga de Datos + Panel de Flota)
xlsx.full.min.js        SheetJS, servido localmente (no desde CDN)
api/chat.js             Backend del asistente (función serverless)
js/app.js               Arranque, navegación, botón Re-analizar
js/data/normalizer.js   Normalización, denominaciones, parseo de horas y metas
js/data/analyzer.js     Reglas de negocio y análisis de toda la flota
js/data/database.js     IndexedDB
js/parsers/             Detección de formato y extracción de cada planilla
js/ui/panel.js          Panel unificado (KPIs + tarjetas editables)
js/ui/datatable.js      Visor/editor de tablas
js/ui/modals.js         Detalle por equipo
js/ai/chat.js           Cliente del asistente
```

## Licencia

El código y la licencia deben revisarse antes de publicarlo como open source. Los datos reales,
credenciales y reglas propietarias de HSV Logística permanecen fuera del repositorio público.
