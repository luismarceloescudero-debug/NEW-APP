/**
 * Proxy backend para el chat IA de FlotaControl.
 *
 * Por qué existe este archivo: FlotaControl es una app 100% cliente (HTML/JS que corre en
 * el navegador de cada usuario, sin servidor propio). Llamar a la API de Anthropic
 * directamente desde ese JS obligaría a poner la API key en el código del navegador, donde
 * cualquier persona que abra la página (F12 -> pestaña Network o Sources) podría copiarla y
 * usarla a tu costo. Esta función serverless (pensada para desplegarse en Vercel) resuelve
 * eso: la API key vive únicamente en una variable de entorno del servidor
 * (ANTHROPIC_API_KEY), nunca en el HTML/JS que se descarga al navegador.
 *
 * Capacidades reales habilitadas acá (no son simulación):
 *   1. Análisis sobre los datos de la flota: el cliente manda un resumen (top equipos,
 *      totales) como contexto en cada request.
 *   2. Tool-use "get_equipo_detalle": si Claude necesita el detalle de un equipo puntual que
 *      no está en el resumen, pide ejecutar esta tool. Como los datos viven en el
 *      IndexedDB del navegador (no acá), esta función NO la resuelve: le devuelve el pedido
 *      de tool_use al cliente (js/ai/chat.js), que consulta localmente y reenvía el
 *      resultado en el siguiente request. Ver stopReason === 'tool_use' en la respuesta.
 *   3. Tool "web_search" (nativa de Anthropic, "server tool"): permite research real en
 *      internet (precios de gasoil, normativas, comparativas de mercado, etc.). Esta la
 *      resuelve Anthropic del lado de ellos, no hace falta código nuestro para ejecutarla.
 *      Tiene costo aparte: ~USD 10 cada 1000 búsquedas + tokens normales.
 *
 * Configuración:
 *   1. Para Anthropic: Project Settings -> Environment Variables -> agregar ANTHROPIC_API_KEY
 *      (se genera en https://console.anthropic.com -> API Keys).
 *   2. Agregar también APP_SHARED_SECRET, con el mismo valor exacto que
 *      APP_SECRET_VALUE en js/config/appSecret.js. Sin esto (o si no coinciden),
 *      /api/chat responde 401 a todo pedido, incluido el del propio frontend.
 *   3. Para Ollama local: AI_PROVIDER=ollama, OLLAMA_BASE_URL (default: http://127.0.0.1:11434)
 *      y OLLAMA_MODEL (default: qwen3:8b). Ollama no necesita API key ni cuota, pero solo es
 *      accesible desde la computadora donde corre; una función serverless de Vercel no puede
 *      conectarse al localhost del usuario.
 *   4. Opcional: ANTHROPIC_MODEL (default: claude-sonnet-5), ANTHROPIC_MAX_WEB_SEARCHES
 *      (default: 0, tope de búsquedas web por mensaje para controlar el costo).
 *   4. Desplegar. Vercel detecta automáticamente cualquier archivo dentro de /api como
 *      función serverless, no hace falta configuración adicional.
 *
 * IMPORTANTE: esto usa la API de Anthropic (facturada por uso, console.anthropic.com),
 * NO la suscripción de chat de claude.ai (Pro/Max) — esa suscripción no tiene una API
 * programable que una app externa pueda llamar.
 */

const crypto = require('crypto');

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-sonnet-5';
const AI_PROVIDER = String(process.env.AI_PROVIDER || 'anthropic').toLowerCase();
const OLLAMA_BASE_URL = String(process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen3:8b';
// Subido de 1536 a 3072 (2026-08-27): al pedirle que investigue/ajuste varios equipos a
// la vez (ej. 10 equipos con metas desactualizadas), la respuesta final que sintetiza todo
// se quedaba sin presupuesto de tokens antes de terminar de escribir texto — el modelo
// SÍ había hecho el trabajo, pero el cliente mostraba "no devolvió una respuesta" porque
// no le alcanzaba para redactar la conclusión.
const MAX_TOKENS = 3072;

// Límites simples para no dejar pasar payloads gigantes/abusivos del cliente
const MAX_CONTEXT_CHARS = 8000;
const MAX_HISTORY_MESSAGES = 24; // incluye idas y vueltas de tool_use/tool_result
const MAX_TOTAL_JSON_CHARS = 120000; // ~120KB de conversación (los tool_result pueden pesar)

const configuredWebSearches = Number.parseInt(process.env.ANTHROPIC_MAX_WEB_SEARCHES, 10);
const maxWebSearches = Number.isInteger(configuredWebSearches)
    ? Math.max(0, Math.min(configuredWebSearches, 3))
    : 0;

const TOOLS = [
    {
        name: 'get_equipo_detalle',
        description: 'Devuelve el detalle completo de UN equipo puntual de la flota (cargas ' +
            'de combustible recientes, actividad GPS, métricas de consumo calculadas y meta ' +
            'de fábrica), identificado por su código "interno" (ej: "TR20", "CM43", "BM09"). ' +
            'Usar cuando el usuario pregunta por un equipo específico que no aparece en el ' +
            'resumen inicial, o cuando el resumen no alcanza para responder con precisión. ' +
            'El resumen inicial solo trae los 10 equipos con más litros cargados; para ' +
            'cualquier otro hay que pedir el detalle con esta tool.',
        input_schema: {
            type: 'object',
            properties: {
                interno: {
                    type: 'string',
                    description: 'Código interno del equipo tal como aparece en la flota, ej "TR20".'
                }
            },
            required: ['interno']
        }
    }
];

// Anthropic no necesita recibir una herramienta de búsqueda cuando está deshabilitada.
// Omitirla evita que un valor 0 dependa de cómo interprete la API un max_uses vacío.
if (AI_PROVIDER === 'anthropic' && maxWebSearches > 0) {
    TOOLS.push({
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: maxWebSearches
    });
}

const OLLAMA_TOOL = {
    type: 'function',
    function: {
        name: 'get_equipo_detalle',
        description: 'Devuelve el detalle completo de un equipo puntual de la flota.',
        parameters: {
            type: 'object',
            properties: { interno: { type: 'string', description: 'Código interno, por ejemplo CM42 o MX96.' } },
            required: ['interno']
        }
    }
};

function ollamaMessages(systemPrompt, messages) {
    const out = [{ role: 'system', content: systemPrompt }];
    for (const m of messages) {
        if (typeof m.content === 'string') { out.push({ role: m.role, content: m.content }); continue; }
        const bloques = Array.isArray(m.content) ? m.content : [];
        if (m.role === 'assistant') {
            const textos = bloques.filter(b => b.type === 'text').map(b => b.text).join('\n');
            const toolCalls = bloques.filter(b => b.type === 'tool_use').map(b => ({
                id: b.id,
                type: 'function',
                function: { name: b.name, arguments: b.input || {} }
            }));
            out.push({ role: 'assistant', content: textos, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) });
        } else {
            const resultados = bloques.filter(b => b.type === 'tool_result');
            const textos = bloques.filter(b => b.type === 'text').map(b => b.text).join('\n');
            if (textos) out.push({ role: 'user', content: textos });
            resultados.forEach(b => out.push({ role: 'tool', tool_call_id: b.tool_use_id, content: typeof b.content === 'string' ? b.content : JSON.stringify(b.content) }));
        }
    }
    return out;
}

async function callOllama(systemPrompt, messages) {
    const upstream = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            model: OLLAMA_MODEL,
            messages: ollamaMessages(systemPrompt, messages),
            tools: [OLLAMA_TOOL],
            stream: false,
            keep_alive: process.env.OLLAMA_KEEP_ALIVE || '10m',
            ...(process.env.OLLAMA_NUM_CTX ? { options: { num_ctx: Number(process.env.OLLAMA_NUM_CTX) } } : {})
        })
    });
    const data = await upstream.json();
    if (!upstream.ok) return { upstream, data };
    const bloques = [];
    if (data.message?.content) bloques.push({ type: 'text', text: data.message.content });
    (data.message?.tool_calls || []).forEach((call, i) => bloques.push({
        type: 'tool_use',
        id: call.id || `ollama-tool-${Date.now()}-${i}`,
        name: call.function?.name,
        input: call.function?.arguments || {}
    }));
    return {
        upstream,
        data: {
            content: bloques,
            stop_reason: data.message?.tool_calls?.length ? 'tool_use' : 'end_turn',
            usage: data.prompt_eval_count || data.eval_count ? { input_tokens: data.prompt_eval_count || 0, output_tokens: data.eval_count || 0 } : null
        }
    };
}

// NOTA DE SEGURIDAD (vuln-guard-deploy, 2026-08-27): antes esta función mandaba
// 'Access-Control-Allow-Origin: *', lo que permitía que CUALQUIER sitio web hiciera
// fetch() a este endpoint desde el navegador de un visitante y gastara la cuota paga de
// ANTHROPIC_API_KEY (incluida la tool "web_search", ~USD 10 cada 1000 usos) a costa del
// dueño de este deploy. El frontend de FlotaControl llama a "/api/chat" en el MISMO
// dominio (ver comentario arriba del archivo), así que no necesita ningún header CORS
// para funcionar: los navegadores nunca exigen CORS en pedidos same-origin. No mandar
// estos headers es la forma más simple de dejar de habilitar ese abuso desde el navegador.
//
// Esto NO alcanza solo: un script o curl fuera de un navegador puede llamar a esta URL
// directamente sin que CORS aplique en absoluto (CORS es una regla que cumplen los
// navegadores, no el servidor). Por eso además exigimos el header X-App-Secret
// (ver isAuthorized() más abajo y js/config/appSecret.js) — corta el abuso automatizado
// y anónimo, aunque no es autenticación real de usuarios (ver ese archivo para el detalle).
function setCors(res) {
    // Sin headers = solo se permiten pedidos same-origin (lo único que este frontend necesita).
}

// Secreto compartido con el frontend (ver js/config/appSecret.js) para que /api/chat deje
// de responder a curl/scripts genéricos que le pegan directo sin pasar por la app. No es
// autenticación de usuarios (todo visitante de la app comparte el mismo valor, visible en
// el JS del navegador) — solo saca del medio el abuso automatizado y anónimo.
function isAuthorized(req) {
    const expected = process.env.APP_SHARED_SECRET;
    if (!expected) return false;

    const provided = req.headers['x-app-secret'];
    if (typeof provided !== 'string') return false;

    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

// Un mensaje es válido si su `content` es texto plano, o un array de bloques
// estructurados (text / tool_use / tool_result / server_tool_use / etc, tal como
// los define la Messages API). No truncamos bloques individualmente porque son JSON
// estructurado (truncar a lo bruto los rompería) — en cambio limitamos el tamaño TOTAL
// de la conversación más abajo.
function isValidContent(content) {
    if (typeof content === 'string') return true;
    if (Array.isArray(content)) {
        return content.every(b => b && typeof b === 'object' && typeof b.type === 'string');
    }
    return false;
}

module.exports = async function handler(req, res) {
    setCors(res);

    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }

    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Método no permitido. Usá POST.' });
        return;
    }

    if (!isAuthorized(req)) {
        res.status(401).json({ error: 'No autorizado.' });
        return;
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (AI_PROVIDER !== 'ollama' && !apiKey) {
        res.status(500).json({
            error: 'El servidor no tiene configurada ANTHROPIC_API_KEY. Agregala en las variables de entorno del proyecto (Vercel/Netlify) y volvé a desplegar.'
        });
        return;
    }

    let body = req.body;
    if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) { body = {}; }
    }
    body = body || {};

    const { messages, context } = body;

    if (!Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({ error: 'Falta "messages" (array de mensajes de la conversación).' });
        return;
    }

    const safeMessages = messages
        .slice(-MAX_HISTORY_MESSAGES)
        .filter(m => m && (m.role === 'user' || m.role === 'assistant') && isValidContent(m.content));

    if (safeMessages.length === 0) {
        res.status(400).json({ error: 'No hay mensajes válidos para enviar.' });
        return;
    }

    if (JSON.stringify(safeMessages).length > MAX_TOTAL_JSON_CHARS) {
        res.status(400).json({ error: 'La conversación se volvió demasiado larga. Iniciá un chat nuevo (recargá la página).' });
        return;
    }

    const safeContext = typeof context === 'string' ? context.slice(0, MAX_CONTEXT_CHARS) : '';

    const systemPrompt = [
        'Sos el asistente de análisis de flota de FlotaControl (HSV Logística).',
        'Respondé siempre en español rioplatense, de forma breve, concreta y accionable.',
        'Para datos de LA FLOTA: basate en el resumen que te dan a continuación. Si preguntan por',
        'un equipo puntual que no está en ese resumen, o necesitás más detalle, usá la tool',
        '"get_equipo_detalle" en vez de inventar cifras.',
        AI_PROVIDER === 'anthropic' && maxWebSearches > 0
            ? 'Para preguntas externas y actuales, usá la tool "web_search"; no respondas de memoria si el dato puede estar desactualizado.'
            : 'No hay búsqueda web habilitada en este proveedor; indicá cuando una respuesta externa no pueda verificarse.',
        'Si de verdad no tenés forma de responder con precisión (ni con los datos de la flota ni',
        'buscando), decilo explícitamente en vez de inventar un número.',
        '',
        'Resumen actual de la flota (top equipos por consumo, no es la lista completa):',
        safeContext || '(Todavía no se cargaron datos en la app.)'
    ].join('\n');

    try {
        const result = AI_PROVIDER === 'ollama'
            ? await callOllama(systemPrompt, safeMessages)
            : { upstream: await fetch(ANTHROPIC_API_URL, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': ANTHROPIC_VERSION
                },
                body: JSON.stringify({
                    model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
                    max_tokens: MAX_TOKENS,
                    system: systemPrompt,
                    messages: safeMessages,
                    tools: TOOLS
                })
            }) };
        const upstream = result.upstream;
        const data = result.data || await upstream.json();

        if (!upstream.ok) {
            console.error(`${AI_PROVIDER} API error:`, data);
            res.status(upstream.status).json({
                error: (data && data.error && data.error.message) || `Error llamando al proveedor IA (${AI_PROVIDER}).`
            });
            return;
        }

        // Devolvemos los bloques de contenido tal cual (no solo el texto plano): el cliente
        // los necesita completos para poder reenviarlos en el siguiente turno si hay
        // tool_use pendiente, y para mostrar citas de web_search si las hay.
        res.status(200).json({
            content: data.content || [],
            stopReason: data.stop_reason || null,
            usage: data.usage || null
        });
    } catch (err) {
        console.error('Error en /api/chat:', err);
        res.status(500).json({ error: `Error interno del servidor al contactar a ${AI_PROVIDER}.` });
    }
};
