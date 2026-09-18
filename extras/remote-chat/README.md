# IA remota (congelada)

`chat.js` es una función serverless (formato Vercel) que llama a Claude vía la API de
Anthropic. **No se despliega ni se usa en el release actual.** El asistente de la app
(`js/ai/chat.js`) le habla directo a Ollama, corriendo en la misma computadora — ver
[`../../docs/DEPLOYMENT.md`](../../docs/DEPLOYMENT.md).

Esta carpeta queda como referencia para quien quiera reactivar un proveedor remoto más
adelante (PLAN4.md, sección 5 y Fase 7). Antes de reactivarla:

- Necesita un hosting con funciones serverless y uso comercial permitido (Vercel Hobby es
  solo para uso personal/no comercial; ver PLAN4.md sección 2).
- La autenticación tiene que ser real (usuario/clave), no un secreto que viaja al navegador:
  el viejo `X-App-Secret` / `APP_SHARED_SECRET` se eliminó del frontend en la Fase 1 porque en
  un repo público cualquiera puede leerlo con "Ver código fuente".
- Hay que volver a cablear `js/ai/chat.js` para hablarle a este endpoint en vez de a Ollama,
  con un tope de gasto configurado en la consola de Anthropic.

No se borra el código porque tiene tool-use (`get_equipo_detalle`, `web_search`) ya resuelto y
probado; reescribirlo desde cero sería trabajo repetido si algún día hace falta.
