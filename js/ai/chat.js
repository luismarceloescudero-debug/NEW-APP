/**
 * AI Chat interaction logic — Asistente de Flota
 *
 * FASE 1 (18/09/2026): se cortó el backend remoto (/api/chat, Claude vía Anthropic). Ese
 * endpoint necesitaba un secreto en el frontend (X-App-Secret) que en un repo público
 * cualquiera puede leer con "Ver código fuente" — no protegía nada. El código de ese backend
 * sigue disponible en extras/remote-chat/ por si se reactiva más adelante con autenticación
 * real (ver ese README).
 *
 * FASE 5 (18/09/2026): el asistente le habla DIRECTO a Ollama (js/ai/ollama.js), corriendo en
 * la misma computadora. Sin backend, sin API key, sin enviar datos de la flota a ningún
 * servidor. No hay búsqueda web (un modelo local no sale a internet por su cuenta): la única
 * tool es `get_equipo_detalle`, resuelta contra el IndexedDB local.
 */
import { getAllEquipos, getAllRawRecords, getAllEstimados } from '../data/database.js';
import {
    periodosAnalisisAutomatico,
    rangoCalendarioDePeriodos,
    filtrarPorPeriodo,
    calculateMetrics,
    determineConsumptionType,
    getConfirmedConsumption,
    getCargasForEquipo,
    getGPSForEquipo
} from '../data/analyzer.js';
import { normalizeEquipoKey } from '../data/normalizer.js';
import { isAvailable, listModels, chat as ollamaChat, getOllamaConfig, setOllamaConfig } from './ollama.js';

const MAX_TURNS = 16; // mensajes (usuario+asistente, incluye idas y vueltas de tools) en memoria
// Subido de 4 a 8 (2026-08-27): un pedido que toca varios equipos a la vez (ej. "investigar
// y ajustar metas" sobre 10 equipos) necesita una ronda de tool-use por cada consulta de
// detalle, y con 4 se cortaba a mitad de camino sin llegar nunca a la respuesta final —
// el usuario veía "el asistente no devolvió una respuesta de texto" aunque en realidad
// estaba a mitad de investigar, no roto.
const MAX_TOOL_ROUNDS = 8; // tope de vueltas tool_calls/tool por mensaje del usuario, para no loopear sin fin

const TOOL_GET_EQUIPO_DETALLE = {
    type: 'function',
    function: {
        name: 'get_equipo_detalle',
        description: 'Devuelve el detalle completo de UN equipo de la flota por su código interno: ' +
            'litros, km, horas, consumo real, meta y últimas cargas. Usar cuando se pregunte por un ' +
            'equipo específico que no esté en el resumen inicial (el resumen solo trae el top 10 por litros).',
        parameters: {
            type: 'object',
            properties: {
                interno: { type: 'string', description: 'Código interno del equipo, por ejemplo "TR20" o "CM43".' }
            },
            required: ['interno']
        }
    }
};

// Historial de la conversación en memoria: [{ role: 'user'|'assistant'|'tool', content, tool_calls? }],
// formato nativo de Ollama. No incluye el resumen de la flota (se recalcula y se antepone como
// mensaje "system" en cada llamada, dentro de sendMessage() — así siempre refleja los datos
// actuales, no una foto del momento en que arrancó la conversación).
// No se persiste nada del chat en localStorage/IndexedDB: se pierde al recargar la página, a
// propósito (privacidad).
let conversation = [];

export function initAIChat() {
    const input = document.getElementById('ai-input');
    const btnSend = document.getElementById('btn-send-ai');
    const history = document.getElementById('ai-chat-history');
    const badge = document.getElementById('ai-status-badge');

    if (!input || !btnSend || !history) return;

    actualizarBadge(badge, 'checking');
    verificarDisponibilidad().then(disponible => actualizarBadge(badge, disponible ? 'ok' : 'muted'));

    const appendMsg = (role, html) => {
        const div = document.createElement('div');
        div.className = `ai-msg ${role === 'user' ? 'user' : 'system'}`;
        div.innerHTML = html;
        history.appendChild(div);
        history.scrollTop = history.scrollHeight;
        return div;
    };

    const setStatus = (el, html) => {
        el.innerHTML = html;
        history.scrollTop = history.scrollHeight;
    };

    // `presetText`: permite mandar un mensaje armado desde afuera (ver preguntarAsistente() más
    // abajo) sin que el usuario tenga que escribirlo — se sigue mostrando en el historial igual
    // que si lo hubiera tipeado, para que quede claro qué se le pidió.
    const sendMessage = async (presetText) => {
        const text = (presetText != null ? presetText : input.value).trim();
        if (!text || btnSend.disabled) return;

        appendMsg('user', escapeHtml(text));
        if (presetText == null) input.value = '';

        const status = appendMsg('system', '<i class="fa-solid fa-spinner fa-spin"></i> Pensando...');
        btnSend.disabled = true;
        input.disabled = true;

        try {
            const disponible = await verificarDisponibilidad();
            actualizarBadge(badge, disponible ? 'ok' : 'muted');
            if (!disponible) {
                setStatus(status, mensajeNoDisponible());
                return;
            }

            let { model } = getOllamaConfig();
            if (!model) {
                const modelos = await listModels().catch(() => []);
                if (!modelos.length) {
                    setStatus(status,
                        '<i class="fa-solid fa-circle-info"></i> Ollama está corriendo pero no tiene ningún modelo descargado. ' +
                        'Ejecutá <code>ollama pull qwen2.5:7b</code> (o el modelo que prefieras) y volvé a intentar.');
                    return;
                }
                model = modelos[0];
                setOllamaConfig({ model });
            }

            conversation.push({ role: 'user', content: text });
            conversation = conversation.slice(-MAX_TURNS);

            const contexto = await buildContextSummary();
            const systemMsg = {
                role: 'system',
                content: 'Sos el asistente de FlotaControl, una app de análisis de consumo de combustible. ' +
                    'Respondé en español rioplatense, corto y directo. No inventes números: si no tenés el ' +
                    'dato, decilo. Para el detalle de un equipo que no esté en este resumen, usá la tool ' +
                    'get_equipo_detalle.\n\n' + contexto
            };

            let round = 0;
            let ultimoMensaje = null;
            while (round < MAX_TOOL_ROUNDS) {
                round++;
                setStatus(status, round === 1
                    ? '<i class="fa-solid fa-spinner fa-spin"></i> Pensando...'
                    : '<i class="fa-solid fa-spinner fa-spin"></i> Consultando datos de la flota...');

                const mensaje = await ollamaChat({
                    model,
                    messages: [systemMsg, ...conversation],
                    tools: [TOOL_GET_EQUIPO_DETALLE]
                });
                ultimoMensaje = mensaje;
                conversation.push(mensaje);
                conversation = conversation.slice(-MAX_TURNS);

                const toolCalls = Array.isArray(mensaje.tool_calls) ? mensaje.tool_calls : [];
                if (!toolCalls.length) break;

                for (const tc of toolCalls) {
                    const nombre = tc.function?.name;
                    const args = tc.function?.arguments || {};
                    const resultado = nombre === 'get_equipo_detalle'
                        ? await resolveEquipoDetalleTool(args.interno)
                        : { error: `Tool desconocida: ${nombre}` };
                    conversation.push({ role: 'tool', content: JSON.stringify(resultado) });
                }
                conversation = conversation.slice(-MAX_TURNS);
            }

            const texto = (ultimoMensaje?.content || '').trim();
            if (texto) {
                setStatus(status, renderTexto(texto));
            } else {
                const motivo = round >= MAX_TOOL_ROUNDS
                    ? `necesité más pasos de los permitidos (${MAX_TOOL_ROUNDS}) para juntar todos los datos — probá pidiendo un equipo o un grupo más chico a la vez`
                    : 'no llegó a generar una respuesta esta vez — probá reformular el pedido';
                setStatus(status, `<i class="fa-solid fa-circle-info"></i> No pude terminar de responder: ${escapeHtml(motivo)}.`);
            }
        } catch (e) {
            console.error('Error en el chat IA:', e);
            actualizarBadge(badge, 'muted');
            setStatus(status, `<i class="fa-solid fa-triangle-exclamation" style="color:var(--accent-red)"></i> No se pudo hablar con Ollama: ${escapeHtml(e.message)}`);
        } finally {
            btnSend.disabled = false;
            input.disabled = false;
            input.focus();
            history.scrollTop = history.scrollHeight;
        }
    };

    btnSend.addEventListener('click', () => sendMessage());
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    /**
     * Investigación profunda desde afuera del chat: expande el panel del Asistente y le manda
     * un pedido ya armado (ver abrirInvestigacionMeta() en panel.js).
     */
    window.preguntarAsistente = (texto) => {
        if (!texto) return;
        const panel = document.getElementById('ai-panel');
        if (panel) panel.classList.remove('collapsed');
        const icon = document.querySelector('#btn-toggle-ai i');
        if (icon) { icon.classList.remove('fa-chevron-up'); icon.classList.add('fa-chevron-down'); }
        sendMessage(texto);
    };
}

async function verificarDisponibilidad() {
    try { return await isAvailable(); } catch (e) { return false; }
}

function actualizarBadge(badge, estado) {
    if (!badge) return;
    badge.classList.remove('ai-status-muted', 'ai-status-ok', 'ai-status-checking');
    if (estado === 'ok') {
        badge.classList.add('ai-status-ok');
        badge.innerHTML = '<i class="fa-solid fa-circle"></i> Local';
    } else if (estado === 'checking') {
        badge.classList.add('ai-status-checking');
        badge.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verificando...';
    } else {
        badge.classList.add('ai-status-muted');
        badge.innerHTML = '<i class="fa-solid fa-circle"></i> No configurada';
    }
}

function mensajeNoDisponible() {
    const { baseUrl } = getOllamaConfig();
    return '<i class="fa-solid fa-circle-info"></i> No se detectó Ollama en ' + escapeHtml(baseUrl) + '. ' +
        'El resto de la app (carga, cálculo, panel) funciona igual sin el asistente. ' +
        'Para activarlo: instalá <a href="https://ollama.com" target="_blank" rel="noopener noreferrer">Ollama</a>, ' +
        'descargá un modelo (<code>ollama pull qwen2.5:7b</code>) y volvé a intentar — ver docs/DEPLOYMENT.md ' +
        'si esta app no está en localhost.';
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
}

/** Texto plano de la respuesta de Ollama: sin bloques ni citas (no hay búsqueda web local). */
function renderTexto(texto) {
    return escapeHtml(texto).replace(/\n/g, '<br>');
}

/**
 * Resuelve la tool "get_equipo_detalle": busca el equipo por su código interno (normalizado,
 * mismo criterio que el resto de la app) en el IndexedDB local y arma un detalle completo
 * -no solo el resumen top-10- para que el modelo pueda responder preguntas puntuales.
 */
async function resolveEquipoDetalleTool(internoQuery) {
    if (!internoQuery) {
        return { error: 'Falta el código "interno" del equipo a buscar.' };
    }
    try {
        const key = normalizeEquipoKey(internoQuery);
        const equipos = await getAllEquipos();
        const equipo = equipos.find(eq => normalizeEquipoKey(eq.interno) === key);
        if (!equipo) {
            return { error: `No se encontró ningún equipo con interno "${internoQuery}" en la base cargada.` };
        }

        const allRecords = await getAllRawRecords();
        const estimadosData = await getAllEstimados();
        const allCargas = allRecords.filter(r => r.type === 'carga');
        const allGps = allRecords.filter(r => r.type === 'gps');

        const periodos = periodosAnalisisAutomatico(allCargas, allGps);
        const rango = rangoCalendarioDePeriodos(periodos);
        const filtro = periodos.length ? { periodos } : {};
        const cargasPeriodo = filtrarPorPeriodo(allCargas, filtro);
        const gpsPeriodo = filtrarPorPeriodo(allGps, filtro);
        const otrosPeriodo = filtrarPorPeriodo(allRecords.filter(r => r.type === 'entrega'), filtro);

        const eqCargas = getCargasForEquipo(equipo.interno, cargasPeriodo);
        const eqGps = getGPSForEquipo(equipo.interno, gpsPeriodo);
        const eqOtros = otrosPeriodo.filter(r =>
            ((r.interno_key || normalizeEquipoKey(r.interno)) === key || (r.dominio_key || '') === normalizeEquipoKey(equipo.dominio)));
        const metrics = calculateMetrics(equipo, eqCargas, eqGps, null, eqOtros);
        const confirmed = getConfirmedConsumption(equipo.interno, estimadosData);

        return {
            equipo: {
                interno: equipo.interno,
                dominio: equipo.dominio,
                marca: equipo.marca,
                modelo: equipo.modelo,
                tipo: equipo.tipo
            },
            periodo_analizado: (rango.desde && rango.hasta) ? `${rango.desde} a ${rango.hasta}` : 'sin período temporal disponible',
            tipo_calculo: determineConsumptionType(equipo, eqCargas),
            total_litros: Number(metrics.total_litros.toFixed(1)),
            total_costo: Number(metrics.total_costo.toFixed(2)),
            total_km: Number(metrics.total_km.toFixed(1)),
            total_horas: Number(metrics.total_horas.toFixed(2)),
            consumo_real: Number(metrics.consumo_real.toFixed(3)),
            meta_fabrica: confirmed ? confirmed.value : null,
            cantidad_cargas_en_periodo: eqCargas.length,
            operacion_loop: metrics.operacion_loop,
            ultimas_cargas: eqCargas
                .slice()
                .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))
                .slice(0, 8)
                .map(c => ({ fecha: c.fecha, litros: c.litros, lugar: c.lugar_carga, centro_costo: c.centro_costo }))
        };
    } catch (e) {
        console.error('Error resolviendo get_equipo_detalle:', e);
        return { error: 'Error interno leyendo la base de datos local de la app.' };
    }
}

/**
 * Arma un resumen en texto plano del estado actual de la flota (equipos, consumos,
 * comparación contra metas) para dárselo al modelo como contexto inicial. Es intencionalmente
 * acotado (top 10) para no volar el tamaño del prompt; para cualquier otro equipo, el modelo
 * usa la tool "get_equipo_detalle" definida arriba.
 */
async function buildContextSummary() {
    try {
        const equipos = await getAllEquipos();
        if (!equipos.length) {
            return '(Todavía no se cargaron archivos Excel en la app; no hay datos de flota disponibles.)';
        }

        const allRecords = await getAllRawRecords();
        const estimadosData = await getAllEstimados();
        const allCargas = allRecords.filter(r => r.type === 'carga');
        const allGps = allRecords.filter(r => r.type === 'gps');

        const periodos = periodosAnalisisAutomatico(allCargas, allGps);
        const rango = rangoCalendarioDePeriodos(periodos);
        const filtro = periodos.length ? { periodos } : {};
        const cargas = filtrarPorPeriodo(allCargas, filtro);
        const gps = filtrarPorPeriodo(allGps, filtro);
        const otros = filtrarPorPeriodo(allRecords.filter(r => r.type === 'entrega'), filtro);

        const totalLitros = cargas.reduce((s, c) => s + (parseFloat(c.litros) || 0), 0);
        const totalCosto = cargas.reduce((s, c) => s + (parseFloat(c.importe) || 0), 0);

        const lines = [];
        lines.push(`Periodo analizado: ${rango.desde && rango.hasta ? `${rango.desde} a ${rango.hasta}` : 'sin período temporal disponible'}.`);
        lines.push(`Equipos en base maestra: ${equipos.length} (usá get_equipo_detalle para cualquiera que no esté en el top de abajo).`);
        lines.push(`Total combustible en el periodo: ${totalLitros.toFixed(1)} L, costo $${totalCosto.toFixed(2)}.`);

        const porEquipo = equipos.map(eq => {
            const eqCargas = getCargasForEquipo(eq.interno, cargas);
            const eqGps = getGPSForEquipo(eq.interno, gps);
            const eqOtros = otros.filter(r =>
                ((r.interno_key || normalizeEquipoKey(r.interno)) === normalizeEquipoKey(eq.interno) || (r.dominio_key || '') === normalizeEquipoKey(eq.dominio)));
            const metrics = calculateMetrics(eq, eqCargas, eqGps, null, eqOtros);
            const confirmed = getConfirmedConsumption(eq.interno, estimadosData);
            return { eq, metrics, confirmed };
        }).filter(r => r.metrics.total_litros > 0);

        porEquipo.sort((a, b) => b.metrics.total_litros - a.metrics.total_litros);
        const top = porEquipo.slice(0, 10);
        if (top.length) {
            lines.push('\nTop equipos por litros cargados en el periodo:');
            top.forEach(r => {
                const metaTxt = r.confirmed ? ` | meta: ${r.confirmed.value}` : ' | sin meta definida';
                lines.push(`- ${r.eq.interno} (${r.eq.marca || ''} ${r.eq.modelo || ''}, ${r.eq.tipo || 'sin tipo'}): ${r.metrics.total_litros.toFixed(1)} L, consumo real ${r.metrics.consumo_real.toFixed(2)} [${r.metrics.tipo_calculo}]${metaTxt}.`);
            });
        }

        const sobreMeta = porEquipo.filter(r => r.confirmed && r.confirmed.valor > 0 && r.metrics.consumo_real > r.confirmed.valor * 1.15);
        if (sobreMeta.length) {
            lines.push('\nEquipos consumiendo por encima de su meta (>15%):');
            sobreMeta.slice(0, 10).forEach(r => {
                lines.push(`- ${r.eq.interno}: real ${r.metrics.consumo_real.toFixed(2)} vs meta ${r.confirmed.valor} [${r.metrics.tipo_calculo}].`);
            });
        }

        return lines.join('\n');
    } catch (e) {
        console.error('No se pudo construir el contexto para el chat IA:', e);
        return '(No se pudo leer la base de datos local de la app para dar contexto; respondé de forma general.)';
    }
}
