# Publicar FlotaControl

## Antes de publicar

No subir:

- Planillas Excel.
- Archivos `.env`.
- Claves API.
- Bases IndexedDB exportadas.
- `tools/invariantes.json` con métricas reales.
- Datos operativos de HSV.

El repositorio está preparado para publicar el núcleo local. La IA remota no es necesaria para
usar el análisis.

## Crear el repositorio en GitHub

Desde la raíz de `flotacontrol-repo-limpio`:

```bash
git add .
git commit -m "chore: initial FlotaControl repository"
git remote add origin https://github.com/USUARIO/flotacontrol.git
git push -u origin main
```

También se puede crear el repositorio vacío desde GitHub y copiar la URL que corresponda. No
marcar la opción de agregar README si ya existe uno localmente.

## GitHub Pages

El archivo `.github/workflows/pages.yml` publica solo:

- `index.html`.
- `js/`.
- `styles/`.
- `xlsx.full.min.js`.

Después del primer `push`:

1. Abrir `Settings` del repositorio.
2. Entrar en `Pages`.
3. Elegir `GitHub Actions` como fuente.
4. Esperar la ejecución del workflow.
5. Abrir la URL indicada por GitHub.

GitHub Pages sirve el frontend, pero no ejecuta `api/chat.js`. Por eso el núcleo funciona y la
IA remota queda deshabilitada.

## IA local con Ollama

Para usar IA sin cuota externa ni enviar los datos a un proveedor remoto:

1. Instalar Ollama desde `https://ollama.com`.
2. Descargar un modelo, por ejemplo `ollama pull qwen3:8b`.
3. Copiar `.env.example` a `.env` y dejar `AI_PROVIDER=ollama`.
4. Mantener `APP_SHARED_SECRET=CONFIGURE_REMOTE_AUTHENTICATION_FIRST` para que coincida con el
   placeholder incluido en `js/config/appSecret.js` durante las pruebas locales.
5. Ejecutar la app con `npm run dev` para servir el frontend y `/api/chat` en `http://localhost:8080`.

Ollama debe estar ejecutándose en la misma computadora. No se puede configurar
`OLLAMA_BASE_URL=http://127.0.0.1:11434` en Vercel esperando que apunte al Ollama local del usuario:
en Vercel `127.0.0.1` es el contenedor serverless, no la PC que abre la página.

## Vercel

Vercel puede importar el repositorio desde GitHub. Seleccionar:

- Framework: `Other`.
- Build command: vacío.
- Output directory: vacío.
- Root directory: `.`.

La aplicación estática funciona sin variables. Para IA remota configurar en Vercel:

```text
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY
APP_SHARED_SECRET
ANTHROPIC_MODEL
ANTHROPIC_MAX_WEB_SEARCHES=0
```

En Vercel no usar `AI_PROVIDER=ollama` salvo que `OLLAMA_BASE_URL` sea un endpoint remoto
accesible y protegido. Para una opción sin cuota en producción habría que alojar un modelo propio
en un servidor con GPU o contratar un proveedor con plan gratuito, cuyos límites dependen del
proveedor.

No colocar esos valores en archivos del repositorio. El endpoint remoto no debe considerarse
seguro sin autenticación real o protección equivalente. `js/config/appSecret.js` contiene un
placeholder y no debe reemplazarse por una falsa clave compartida: primero hay que implementar
login o protección de despliegue.

## Otros hostings

Netlify, Cloudflare Pages o cualquier servidor HTTP estático pueden servir el núcleo de la misma
forma que GitHub Pages. Si no ejecutan funciones serverless, `/api/chat` no estará disponible,
pero el análisis local seguirá funcionando.
