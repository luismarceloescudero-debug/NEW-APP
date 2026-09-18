# Publicar FlotaControl

FlotaControl es una app 100% estática: HTML + CSS + JS que corre en el navegador. No tiene
backend propio, no necesita base de datos ni variables de entorno para funcionar. Cualquier
hosting de archivos estáticos alcanza.

## Antes de publicar

No subir nunca:

- Planillas Excel (`.xlsx`, `.csv`).
- Archivos `.env`.
- Claves API o tokens.
- Bases IndexedDB exportadas (backups).
- `tools/invariantes.json` con métricas reales.
- Cualquier dato operativo de HSV (dominios, patentes, nombres de choferes, centros de costo).

El `.gitignore` ya bloquea las extensiones y nombres de archivo más comunes, y el workflow de
CI (`.github/workflows/ci.yml`) falla el build si detecta alguno de estos archivos en el commit.
Aun así, revisar `git status` y `git diff --stat` antes de cada push es la única defensa real:
un `.gitignore` no impide un `git add -f`.

## Crear el repositorio en GitHub

```bash
git remote add origin https://github.com/USUARIO/REPO.git
git push -u origin main
```

## GitHub Pages (hosting recomendado)

Gratuito en repos públicos, sin límite de uso comercial. El workflow
`.github/workflows/pages.yml` publica:

- `index.html`, `manifest.webmanifest`, `sw.js`.
- `js/`, `styles/`, `icons/`.
- `xlsx.full.min.js`.

Después del primer `push`:

1. Abrir `Settings` del repositorio en GitHub.
2. Entrar en `Pages`.
3. En "Build and deployment", elegir **GitHub Actions** como fuente (una sola vez).
4. Esperar a que termine el workflow (pestaña `Actions`).
5. Abrir la URL que GitHub indica, con forma `https://USUARIO.github.io/REPO/`.

Como la app queda bajo un subdirectorio (`/REPO/`, no la raíz del dominio), todas las rutas del
frontend son relativas (`./js/...`, `xlsx.full.min.js`, nunca `/js/...`). Si se agrega un
archivo nuevo, mantener ese criterio.

## IA local con Ollama

FlotaControl no necesita IA para funcionar: cargar planillas, calcular consumos y ver el panel
funciona igual sin ningún proveedor configurado. Cuando se quiere usar el asistente:

1. Instalar Ollama desde [ollama.com](https://ollama.com).
2. Descargar un modelo, por ejemplo `ollama pull qwen2.5:7b` (necesita soportar *tool calling*;
   ver `js/ai/ollama.js` para la lista verificada).
3. Permitir que Ollama acepte pedidos desde el origen donde está publicada la app. Por
   defecto Ollama solo acepta `localhost`; si la app está en GitHub Pages hay que agregar su
   origen a `OLLAMA_ORIGINS` **antes de iniciar el servicio de Ollama**:

   PowerShell (variable de usuario, no hace falta reiniciar Windows, sí Ollama):
   ```powershell
   [System.Environment]::SetEnvironmentVariable('OLLAMA_ORIGINS', 'https://USUARIO.github.io', 'User')
   ```
   Después reiniciar Ollama (cerrar el ícono de la bandeja y volver a abrirlo, o `ollama serve`
   de nuevo en una terminal nueva).
4. Abrir FlotaControl → Configuración → Asistente IA, y confirmar que detecta Ollama.

El navegador le habla **directo** a `http://127.0.0.1:11434` (o al host que se configure): no
hay ningún servidor intermedio, ninguna clave y ningún dato de la flota sale de la computadora
que corre Ollama. Si Ollama no está instalado o no responde, la app muestra "IA no configurada"
y el resto sigue funcionando.

## Otros hostings estáticos

Netlify, Cloudflare Pages, un simple `python -m http.server` o cualquier servidor HTTP que
sirva archivos estáticos funcionan igual que GitHub Pages, siempre que respeten las rutas
relativas del proyecto. No hace falta ninguna función serverless para el núcleo de la app.

## Por qué no Vercel

Se evaluó y se descartó como hosting principal (ver `PLAN4.md`, sección 2):

- El plan gratuito de Vercel (Hobby) es para uso **personal y no comercial**; FlotaControl es
  una herramienta interna de una empresa, uso comercial.
- Lo único que Vercel agregaba sobre GitHub Pages era ejecutar una función serverless
  (`/api/chat`), y con IA local esa función no tiene ningún rol: el servidor de Vercel no puede
  llegar al `127.0.0.1` de la computadora del usuario.

## IA remota (no incluida en este release)

El código para un backend con Claude vía la API de Anthropic quedó en `extras/remote-chat/`,
sin desplegar. Reactivarlo requiere: un hosting con funciones serverless de uso comercial
permitido (por ejemplo Cloudflare Workers), autenticación real (no un secreto en el frontend) y
un tope de gasto configurado en la consola del proveedor. Ver `extras/remote-chat/README.md`.
