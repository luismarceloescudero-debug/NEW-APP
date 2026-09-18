/**
 * AI Chat interaction logic — Asistente de Flota
 *
 * FASE 1 (18/09/2026): se cortó el backend remoto (/api/chat, Claude vía Anthropic). Ese
 * endpoint necesitaba un secreto en el frontend (X-App-Secret) que en un repo público
 * cualquiera puede leer con "Ver código fuente" — no protegía nada. El código de ese backend
 * sigue disponible en extras/remote-chat/ por si se reactiva más adelante con autenticación
 * real (ver ese README).
 *
 * FASE 5 (pendiente): el asistente va a hablarle directo a Ollama, corriendo en la misma
 * computadora (http://127.0.0.1:11434), sin backend ni API key. Hasta entonces esta vista
 * informa "IA no configurada" y el resto de la app funciona igual — la IA nunca fue requisito
 * para analizar la flota.
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

const MAX_TURNS = 16; // mensajes (usuario+asistente, incluye idas y vueltas de tools) en memoria
// Subido de 4 a 8 (2026-08-27): un pedido que toca varios equipos a la vez (ej. "investigar
// y ajustar metas" sobre 10 equipos) necesita una ronda de tool_use por cada consulta de
// detalle, y con 4 se cortaba a mitad de camino sin llegar nunca a la respuesta final —
// el usuario veía "el asistente no devolvió una respuesta de texto" aunque en realidad
// estaba a mitad de investigar, no roto.
const MAX_TOOL_ROUNDS = 8; // tope de vueltas tool_use/tool_result por mensaje del usuario, para no loopear sin fin

// Historial de la conversación en memoria. Cada item es { role, content } donde `content`
// puede ser un string (turno de texto simple) o un array de bloques (tool_use/tool_result/
// texto con citas), tal como los define la Messages API de Anthropic.
// No se persiste nada del chat en localStorage/IndexedDB: se pierde al recargar la página,
// a propósito (privacidad).
let conversation = [];

export function initAIChat() {
    const input = document.getElementById('ai-input');
    const btnSend = document.getElementById('btn-send-ai');
    const history = document.getElementById('ai-chat-history');

    if (!input || !btnSend || !history) return;

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
        conversation.push({ role: 'user', content: text });
        conversation = conversation.slice(-MAX_TURNS);
        if (presetText == null) input.value = '';

        const status = appendMsg('system', '<i class="fa-solid fa-circle-info"></i> IA no configurada.');
        // FASE 1: sin backend remoto. FASE 5 (pendiente) conecta esto a Ollama local — ver el
        // comentario de arriba de archivo. buildContextSummary() y resolveEquipoDetalleTool()
        // quedan implementadas y probadas para que esa fase solo tenga que cablear el proveedor.
        setStatus(status, '<i class="fa-solid fa-circle-info"></i> IA no configurada todavía en este release. El resto de la app (carga, cálculo, panel) funciona igual sin ella.');
    };

    btnSend.addEventListener('click', () => sendMessage());
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    /**
     * Investigación profunda desde afuera del chat: expande el panel del Asistente y le manda
     * un pedido ya armado (ver abrirInvestigacionMeta() en panel.js), usando la tool real
     * "web_search" para ir a buscar el dato afuera — no a resumir lo que la app ya muestra.
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

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
}

/**
 * Renderiza los bloques `content` que devuelve la Messages API: toma los bloques de tipo
 * "text" (ignora tool_use/tool_result/server_tool_use, que son internos del razonamiento),
 * y si el texto trae citas de web_search las muestra como una lista de fuentes.
 */
function renderContentBlocks(content) {
    const textBlocks = (content || []).filter(b => b.type === 'text' && b.text);
    if (textBlocks.length === 0) return '';

    let html = textBlocks.map(b => escapeHtml(b.text).replace(/\n/g, '<br>')).join('<br><br>');

    const citations = [];
    const seenUrls = new Set();
    textBlocks.forEach(b => {
        (b.citations || []).forEach(c => {
            if (c.url && !seenUrls.has(c.url)) {
                seenUrls.add(c.url);
                citations.push(c);
            }
        });
    });

    if (citations.length) {
        html += '<div style="margin-top:0.5rem; font-size:0.75rem; color:var(--text-muted);">Fuentes: ' +
            citations.map(c => `<a href="${escapeHtml(c.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(c.title || c.url)}</a>`).join(' · ') +
            '</div>';
    }

    return html;
}

/**
 * Resuelve la tool "get_equipo_detalle": busca el equipo por su código interno (normalizado,
 * mismo criterio que el resto de la app) en el IndexedDB local y arma un detalle completo
 * -no solo el resumen top-10- para que Claude pueda responder preguntas puntuales.
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
 * comparación contra metas) para dárselo a Claude como contexto inicial. Es intencionalmente
 * acotado (top 10) para no volar el tamaño del prompt; para cualquier otro equipo, Claude
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
