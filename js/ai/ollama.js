/**
 * Adaptador de Ollama — Fase 5 de PLAN4.md.
 *
 * El navegador le habla DIRECTO a Ollama (por defecto http://127.0.0.1:11434, corriendo en la
 * misma computadora): no hay backend propio, no hay API key, y ningún dato de la flota sale de
 * la computadora que corre Ollama. Esto reemplaza al backend remoto /api/chat que se sacó en
 * la Fase 1 (ver extras/remote-chat/).
 *
 * Requisitos del lado de Ollama para que esto funcione contra un sitio publicado (no
 * localhost): la variable de entorno OLLAMA_ORIGINS tiene que incluir el origen de la app
 * (ver docs/DEPLOYMENT.md). Contra `http://localhost:8080` en desarrollo, Ollama ya acepta
 * pedidos por defecto.
 *
 * No hay búsqueda web: un modelo local no puede salir a internet por su cuenta, y agregar esa
 * capacidad implicaría un backend con su propia clave — justo lo que esta fase evita. La única
 * tool disponible es `get_equipo_detalle`, resuelta enteramente contra el IndexedDB local.
 */

const CLAVE_CONFIG = 'flotacontrol_ollama_config';
const CONFIG_POR_DEFECTO = { baseUrl: 'http://127.0.0.1:11434', model: '' };
const TIMEOUT_DISPONIBILIDAD_MS = 2500;
const TIMEOUT_CHAT_MS = 120000; // los modelos locales pueden tardar bastante en CPU

export function getOllamaConfig() {
    try {
        const raw = localStorage.getItem(CLAVE_CONFIG);
        if (!raw) return { ...CONFIG_POR_DEFECTO };
        return { ...CONFIG_POR_DEFECTO, ...JSON.parse(raw) };
    } catch (e) { return { ...CONFIG_POR_DEFECTO }; }
}

export function setOllamaConfig(cambios) {
    const actual = getOllamaConfig();
    const nuevo = { ...actual, ...cambios };
    try { localStorage.setItem(CLAVE_CONFIG, JSON.stringify(nuevo)); } catch (e) { /* solo se pierde la preferencia, no es grave */ }
    return nuevo;
}

async function fetchConTimeout(url, opciones, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...opciones, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

/**
 * ¿Hay un Ollama respondiendo en baseUrl? No lanza: cualquier error de red, CORS (falta
 * OLLAMA_ORIGINS) o timeout se traduce en "no disponible", que es justamente el estado que la
 * UI necesita mostrar como "IA no configurada" sin romper el resto de la app.
 */
export async function isAvailable(baseUrl = getOllamaConfig().baseUrl) {
    try {
        const res = await fetchConTimeout(`${baseUrl}/api/tags`, { method: 'GET' }, TIMEOUT_DISPONIBILIDAD_MS);
        return res.ok;
    } catch (e) {
        return false;
    }
}

/** Modelos ya descargados en esa instalación de Ollama (`ollama pull ...`). */
export async function listModels(baseUrl = getOllamaConfig().baseUrl) {
    const res = await fetchConTimeout(`${baseUrl}/api/tags`, { method: 'GET' }, TIMEOUT_DISPONIBILIDAD_MS);
    if (!res.ok) throw new Error(`Ollama respondió ${res.status}`);
    const data = await res.json().catch(() => ({}));
    return Array.isArray(data.models) ? data.models.map(m => m.name) : [];
}

/**
 * Un turno de chat. `messages` sigue el formato de Ollama: [{role: 'system'|'user'|'assistant'|'tool', content, tool_calls?}].
 * `tools`, si se pasa, sigue el formato tipo OpenAI que espera /api/chat:
 *   [{ type: 'function', function: { name, description, parameters } }]
 * Devuelve el `message` completo de la respuesta ({ role, content, tool_calls? }).
 * No usa streaming: cada ronda de esta app reemplaza el texto mostrado entero (ver
 * js/ai/chat.js), así que no hay UX que perder, y el código de manejo de tool-use queda
 * mucho más simple sin tener que ensamblar chunks.
 */
export async function chat({ baseUrl = getOllamaConfig().baseUrl, model, messages, tools } = {}) {
    if (!model) throw new Error('No hay ningún modelo de Ollama configurado.');
    const res = await fetchConTimeout(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, tools: tools?.length ? tools : undefined, stream: false })
    }, TIMEOUT_CHAT_MS);

    if (!res.ok) {
        const texto = await res.text().catch(() => '');
        throw new Error(`Ollama respondió ${res.status}${texto ? `: ${texto.slice(0, 200)}` : ''}`);
    }
    const data = await res.json().catch(() => ({}));
    if (!data.message) throw new Error('Ollama no devolvió ningún mensaje.');
    return data.message;
}
