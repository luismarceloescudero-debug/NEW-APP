# Primera fase — ejecutar y probar

## Objetivo

Comprobar que el repositorio limpio puede analizar datos sin incluir planillas reales, sin
duplicar movimientos y sin cambiar silenciosamente las referencias numéricas.

## Preparar el entorno

Requisitos:

- Node.js LTS.
- npm.
- Python 3 para servir el frontend.
- Planillas reales fuera del repositorio.

Desde la raíz:

```bash
npm install
```

PowerShell:

```powershell
$env:FLOTACONTROL_ARCHIVOS = 'C:\ruta\a\ARCHIVOS'
$env:FLOTACONTROL_INVARIANTES = 'C:\ruta\privada\invariantes.json'
```

Git Bash:

```bash
export FLOTACONTROL_ARCHIVOS="/c/ruta/a/ARCHIVOS"
export FLOTACONTROL_INVARIANTES="/c/ruta/privada/invariantes.json"
```

## Ejecutar los arneses

```bash
npm run declarados
npm run verificar
npm run auditar
```

Resultado obligatorio:

- `declarados`: código 0.
- `verificar`: código 0 y dataset documentado.
- `auditar`: código 0.

Si `verificar` falla, detener el release. No ejecutar `verificar:actualizar` hasta comparar
archivos, hashes, filas y litros.

## Probar la interfaz

```bash
python -m http.server 8080
```

Abrir `http://localhost:8080` y comprobar:

- La aplicación abre sin errores de módulos.
- El inicio sin datos muestra Carga de Datos.
- Las planillas se procesan localmente.
- El Panel muestra período, fuentes y KPIs.
- Una reimportación no duplica litros, kilómetros ni horas.
- Una edición permanece después de recargar.
- Re-analizar limpia movimientos y conserva el maestro cuando corresponde.
- La aplicación funciona si `/api/chat` no existe.
- La consola no muestra errores de IndexedDB, CORS o módulos.

## Criterio de bloqueo

No publicar si existe:

- Diferencia no explicada en filas o litros.
- Duplicación de datos.
- Pérdida de correcciones.
- Error de migración de IndexedDB.
- Pantalla vacía después de procesar.
- Error crítico en consola.
