/**
 * Tarjeta "Equipos fuera de operación" del dashboard: los tres modales que cuelgan de ella.
 *   - Marcar equipo: fuera de servicio, traslado a San Juan, taller externo/interno, vendido.
 *   - Alta de equipo: carga a mano de un equipo nuevo en el maestro.
 *   - Completar altas automáticas: los equipos que el análisis dio de alta solos y a los que les
 *     faltan datos del padrón (patente, marca, modelo, año, potencia).
 * La lógica pura vive en data/estados-equipo.js; acá solo hay DOM y escritura a la base.
 */
import { getAllEquipos, updateEquipo, upsertEquipos, setSeguimientoEquipo, registrarEdicion } from '../data/database.js';
import {
    CATEGORIAS_SEGUIMIENTO, CATEGORIAS_FUERA_DE_OPERACION, CAMPOS_ALTA_EQUIPO,
    rangoDeEstado, altasConDatosPendientes, validarAlta
} from '../data/estados-equipo.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hoyLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function abrirModal(id, html) {
    const container = document.getElementById('modals-container');
    if (!container) return null;
    document.getElementById(id)?.remove();
    container.insertAdjacentHTML('beforeend', `<div class="modal-overlay active" id="${id}">${html}</div>`);
    const modal = document.getElementById(id);
    const cerrar = () => modal.remove();
    modal.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', cerrar));
    modal.addEventListener('click', (e) => { if (e.target === modal) cerrar(); });
    return { modal, cerrar };
}

const CAMPO_ESTILO = 'width:100%;margin-bottom:0.75rem';
const ETIQUETA = (t) => `<label class="correc-field-label" style="display:block;text-align:left;margin-bottom:0.3rem">${t}</label>`;

/**
 * @param {Object} p
 * @param {Array}  p.equipos      filas del maestro (para elegir el equipo)
 * @param {Map}    p.seguimiento  estados actuales por interno (para avisar si ya tiene uno)
 * @param {string} [p.interno]    equipo preseleccionado
 * @param {Function} p.onGuardado
 */
export function abrirMarcarEquipo({ equipos = [], seguimiento = new Map(), interno = '', onGuardado }) {
    const ordenados = [...equipos].sort((a, b) => String(a.interno).localeCompare(String(b.interno)));
    const opciones = CATEGORIAS_SEGUIMIENTO.filter(c => CATEGORIAS_FUERA_DE_OPERACION.includes(c.id));
    const ui = abrirModal('modal-marcar-equipo', `
        <div class="modal-content" style="max-width:560px">
            <div class="modal-header">
                <div><h2>Marcar equipo fuera de operación</h2>
                <p class="modal-sub">Los días del estado se descuentan de los días hábiles de cobertura. No saca al equipo del análisis.</p></div>
                <button class="btn-close" data-close><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="modal-body">
                ${ETIQUETA('Equipo')}
                <input type="text" id="mk-interno" list="mk-lista" style="${CAMPO_ESTILO}" placeholder="Interno (ej. TR21)" value="${esc(interno)}" autocomplete="off">
                <datalist id="mk-lista">${ordenados.map(e => `<option value="${esc(e.interno)}">${esc([e.dominio, e.denominacion || e.tipo].filter(Boolean).join(' · '))}</option>`).join('')}</datalist>
                <div id="mk-aviso" class="modal-note" style="margin:-0.4rem 0 0.75rem"></div>
                ${ETIQUETA('Estado')}
                <select id="mk-categoria" style="${CAMPO_ESTILO}">${opciones.map(c => `<option value="${c.id}">${esc(c.label)}</option>`).join('')}</select>
                <div style="display:flex;gap:0.75rem">
                    <div style="flex:1">${ETIQUETA('Desde')}<input type="date" id="mk-desde" style="${CAMPO_ESTILO}" value="${hoyLocal()}"></div>
                    <div style="flex:1">${ETIQUETA('Hasta (vacío = sigue)')}<input type="date" id="mk-hasta" style="${CAMPO_ESTILO}"></div>
                </div>
                ${ETIQUETA('Detalle (opcional)')}
                <textarea id="mk-motivo" rows="2" style="${CAMPO_ESTILO}" placeholder="Ej: motor fundido, vendido a ..., trasladado a la sucursal San Juan"></textarea>
                <div class="modal-actions" style="display:flex;gap:0.5rem;justify-content:flex-end">
                    <button class="btn-secondary btn-sm" data-close>Cancelar</button>
                    <button class="btn-primary btn-sm" id="mk-guardar"><i class="fa-solid fa-floppy-disk"></i> Guardar</button>
                </div>
            </div>
        </div>`);
    if (!ui) return;
    const { modal, cerrar } = ui;
    const campo = (id) => modal.querySelector(id);

    const avisar = () => {
        const actual = seguimiento.get(campo('#mk-interno').value.trim().toUpperCase());
        const cat = actual && CATEGORIAS_SEGUIMIENTO.find(c => c.id === actual.categoria);
        campo('#mk-aviso').textContent = actual ? `Ya tiene un estado: ${cat ? cat.label : actual.categoria}. Guardar lo reemplaza.` : '';
    };
    campo('#mk-interno').addEventListener('input', avisar);
    avisar();

    campo('#mk-guardar').addEventListener('click', async () => {
        const interno = campo('#mk-interno').value.trim().toUpperCase();
        const equipo = equipos.find(e => String(e.interno).toUpperCase() === interno);
        if (!equipo) { alert('Elegí un equipo que exista en el maestro. Si es nuevo, primero dalo de alta.'); return; }
        const categoria = campo('#mk-categoria').value;
        const desde = campo('#mk-desde').value;
        const hasta = campo('#mk-hasta').value;
        if (!desde) { alert('Falta la fecha desde la que rige el estado.'); return; }
        if (hasta && hasta < desde) { alert('La fecha de fin es anterior a la de inicio.'); return; }
        const motivo = campo('#mk-motivo').value.trim();
        await setSeguimientoEquipo(equipo.interno, motivo, categoria, rangoDeEstado({ desde, hasta, categoria }));
        await registrarEdicion({
            tabla: 'equipo', registroId: equipo.interno, etiqueta: equipo.interno, campo: 'Estado',
            valorAnterior: seguimiento.get(equipo.interno)?.categoria || '',
            valorNuevo: `${categoria} desde ${desde}${hasta ? ' hasta ' + hasta : ''}${motivo ? ' · ' + motivo : ''}`
        });
        cerrar();
        if (onGuardado) await onGuardado();
    });
}

/** Alta manual de un equipo nuevo en el maestro. */
export function abrirAltaEquipo({ equipos = [], onGuardado }) {
    const ui = abrirModal('modal-alta-equipo', `
        <div class="modal-content" style="max-width:520px">
            <div class="modal-header">
                <div><h2>Dar de alta un equipo</h2>
                <p class="modal-sub">Solo el interno es obligatorio. Lo demás se puede completar después; lo que cargues acá no lo pisa una reimportación del padrón.</p></div>
                <button class="btn-close" data-close><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="modal-body">
                ${ETIQUETA('Interno')}
                <input type="text" id="alta-interno" style="${CAMPO_ESTILO}" placeholder="Ej. TR77" autocomplete="off">
                ${CAMPOS_ALTA_EQUIPO.map(c => `${ETIQUETA(c.label)}<input type="${c.id === 'anio' ? 'number' : 'text'}" data-alta="${c.id}" style="${CAMPO_ESTILO}">`).join('')}
                <div class="modal-actions" style="display:flex;gap:0.5rem;justify-content:flex-end">
                    <button class="btn-secondary btn-sm" data-close>Cancelar</button>
                    <button class="btn-primary btn-sm" id="alta-guardar"><i class="fa-solid fa-floppy-disk"></i> Dar de alta</button>
                </div>
            </div>
        </div>`);
    if (!ui) return;
    const { modal, cerrar } = ui;

    modal.querySelector('#alta-guardar').addEventListener('click', async () => {
        const v = validarAlta(modal.querySelector('#alta-interno').value, equipos);
        if (!v.ok) { alert(v.motivo); return; }
        const fila = { interno: v.interno, alta_manual: true, fecha_alta_manual: new Date().toISOString(), origen: ['alta manual'] };
        const editados = [];
        modal.querySelectorAll('[data-alta]').forEach(inp => {
            const valor = inp.value.trim();
            if (!valor) return;
            fila[inp.dataset.alta] = inp.dataset.alta === 'dominio' ? valor.toUpperCase() : valor;
            editados.push(inp.dataset.alta);
        });
        fila.editado_manual = editados;
        await upsertEquipos([fila]);
        await registrarEdicion({ tabla: 'maestro', registroId: v.interno, etiqueta: v.interno, campo: 'Alta manual', valorAnterior: '', valorNuevo: 'equipo nuevo' });
        cerrar();
        if (onGuardado) await onGuardado();
    });
}

/** Pide los datos que le faltan a los equipos dados de alta automáticamente. */
export async function abrirCompletarAltas({ onGuardado }) {
    const pendientes = altasConDatosPendientes(await getAllEquipos());
    if (!pendientes.length) { alert('Todos los equipos dados de alta automáticamente tienen sus datos completos.'); return; }
    const ui = abrirModal('modal-completar-altas', `
        <div class="modal-content modal-wide">
            <div class="modal-header">
                <div><h2>Completar datos de equipos nuevos</h2>
                <p class="modal-sub">El análisis dio de alta ${pendientes.length} equipo${pendientes.length === 1 ? '' : 's'} solo, a partir de las cargas. Completá lo que sepas; lo que dejes vacío sigue pendiente.</p></div>
                <button class="btn-close" data-close><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="modal-body">
                <div class="table-responsive"><table class="data-table">
                    <thead><tr><th>Interno</th>${CAMPOS_ALTA_EQUIPO.map(c => `<th>${c.label}</th>`).join('')}</tr></thead>
                    <tbody>${pendientes.map(({ equipo, faltan }) => `<tr data-interno="${esc(equipo.interno)}">
                        <td class="cell-key">${esc(equipo.interno)}</td>
                        ${CAMPOS_ALTA_EQUIPO.map(c => faltan.includes(c.id)
                            ? `<td><input type="${c.id === 'anio' ? 'number' : 'text'}" data-campo="${c.id}" style="width:100%;font-size:0.82rem"></td>`
                            : `<td class="cell-muted">${esc(equipo[c.id])}</td>`).join('')}
                    </tr>`).join('')}</tbody>
                </table></div>
                <div class="modal-actions" style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:1rem">
                    <button class="btn-secondary btn-sm" data-close>Cancelar</button>
                    <button class="btn-primary btn-sm" id="altas-guardar"><i class="fa-solid fa-floppy-disk"></i> Guardar</button>
                </div>
            </div>
        </div>`);
    if (!ui) return;
    const { modal, cerrar } = ui;

    modal.querySelector('#altas-guardar').addEventListener('click', async () => {
        const maestro = await getAllEquipos();
        for (const fila of modal.querySelectorAll('tbody tr[data-interno]')) {
            const eq = maestro.find(e => e.interno === fila.dataset.interno);
            if (!eq) continue;
            const cargados = [...fila.querySelectorAll('[data-campo]')].filter(i => i.value.trim());
            if (!cargados.length) continue;
            cargados.forEach(i => { eq[i.dataset.campo] = i.dataset.campo === 'dominio' ? i.value.trim().toUpperCase() : i.value.trim(); });
            eq.editado_manual = [...new Set([...(eq.editado_manual || []), ...cargados.map(i => i.dataset.campo)])];
            await updateEquipo(eq);
            await registrarEdicion({ tabla: 'maestro', registroId: eq.interno, etiqueta: eq.interno, campo: 'Datos de alta', valorAnterior: '', valorNuevo: cargados.map(i => `${i.dataset.campo}=${i.value.trim()}`).join(', ') });
        }
        cerrar();
        if (onGuardado) await onGuardado();
    });
}
