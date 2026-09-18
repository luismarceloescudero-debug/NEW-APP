/**
 * Vista previa y mapeo de columnas — Fase 7 (importación flexible).
 *
 * Aparece cuando un archivo NO coincide exacto con un formato conocido y tampoco es un
 * formato ya confirmado antes (ver inspeccionarArchivo() en xlsx-parser.js). Muestra qué
 * entendió la app de cada columna (formato detectado, ejemplos, campo sugerido) y deja
 * corregir el tipo de planilla y cada columna ANTES de combinar nada con el resto.
 *
 * Si el archivo se elige como Cargas de Combustible, primero se mide cuántas de sus filas ya
 * existen en las cargas cargadas (misma fecha, interno/dominio y litros): caso real, el reporte
 * de la estación GRIS repetía cargas de la planilla global. Si se superpone, por defecto se
 * guarda APARTE y no suma litros; incorporarlo al cálculo es una decisión explícita.
 *
 * abrirVistaPrevia(insp, file) → Promise<decision | null> (null = omitir el archivo).
 */
import { ESQUEMAS } from '../parsers/esquemas.js';
import { superposicionConCargas } from '../parsers/index.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Para "otra planilla" (cubiertas, insumos...) solo hace falta saber quién es el equipo y la
// fecha: el importador genérico ya guarda todas las columnas y suma solas las numéricas.
const CAMPOS_OTRA = {
    interno: { etiqueta: 'Interno (o interno + dominio)', requerido: true, identidad: true },
    dominio: { etiqueta: 'Dominio / patente', identidad: true },
    fecha:   { etiqueta: 'Fecha' }
};
const UMBRAL_SUPERPOSICION = 0.2;

const FORMATO_TXT = { identidad: 'Identidad', fecha: 'Fecha', horas: 'Horas', numero: 'Número', texto: 'Texto', vacia: 'Vacía' };

export function abrirVistaPrevia(insp, file) {
    return new Promise((resolve) => {
        const container = document.getElementById('modals-container');
        if (!container) { resolve(null); return; }

        const tipoInicial = insp.sugerencia || 'OTRA';
        const puntaje = Object.fromEntries((insp.puntajes || []).map(p => [p.tipo, p]));
        const opcionesTipo = Object.entries(ESQUEMAS).map(([t, e]) =>
            `<option value="${t}" ${t === tipoInicial ? 'selected' : ''}>${esc(e.etiqueta)}${puntaje[t] ? ` — se parece ${Math.round(puntaje[t].puntaje * 100)}%` : ''}</option>`
        ).join('') + `<option value="OTRA" ${tipoInicial === 'OTRA' ? 'selected' : ''}>Otra planilla (cubiertas, insumos, otro bien…)</option>`;

        container.insertAdjacentHTML('beforeend', `
        <div class="modal-overlay active" id="mapeo-modal">
            <div class="modal-content mapeo-modal">
                <div class="modal-header">
                    <h2><i class="fa-solid fa-table-columns"></i> Revisar columnas antes de importar</h2>
                    <button class="btn-close" id="btn-mapeo-cerrar" title="Omitir este archivo"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="modal-body">
                    <p class="mapeo-intro"><strong>${esc(insp.filename)}</strong> · ${insp.filasTotal} filas.
                        No coincide exacto con ningún formato conocido, así que no se importa hasta que confirmes qué es cada columna.
                        Todo se asocia al equipo por <strong>interno + dominio</strong>.</p>
                    ${insp.posibleDuplicadoCargas ? `<p class="mapeo-alerta"><i class="fa-solid fa-triangle-exclamation"></i> Tiene litros y tipo de combustible pero no "LUGAR DE CARGA": suele ser el reporte de una estación que repite cargas de la planilla global.</p>` : ''}

                    <div class="mapeo-fila">
                        <label for="mapeo-tipo">¿Qué es esta planilla?</label>
                        <select id="mapeo-tipo">${opcionesTipo}</select>
                    </div>
                    <div class="mapeo-fila" id="mapeo-nombre-wrap">
                        <label for="mapeo-nombre">Nombre</label>
                        <input type="text" id="mapeo-nombre" value="${esc(insp.generico?.etiqueta || '')}" placeholder="Ej. Cubiertas">
                    </div>

                    <div class="mapeo-tabla-wrap">
                        <table class="mapeo-tabla">
                            <thead><tr><th>Columna del archivo</th><th>Formato detectado</th><th>Ejemplos</th><th>Corresponde a</th></tr></thead>
                            <tbody id="mapeo-cuerpo"></tbody>
                        </table>
                    </div>
                    <div id="mapeo-faltantes"></div>
                    <div id="mapeo-superposicion"></div>

                    <label class="mapeo-check"><input type="checkbox" id="mapeo-recordar" checked> Recordar este formato: la próxima vez que llegue un archivo con estas mismas columnas, se importa solo.</label>

                    <div class="mapeo-botones">
                        <button id="btn-mapeo-omitir" class="btn-secondary">Omitir este archivo</button>
                        <button id="btn-mapeo-importar" class="btn-primary"><i class="fa-solid fa-file-import"></i> Importar así</button>
                    </div>
                </div>
            </div>
        </div>`);

        const modal = document.getElementById('mapeo-modal');
        const selTipo = document.getElementById('mapeo-tipo');
        const cuerpo = document.getElementById('mapeo-cuerpo');
        const nombreWrap = document.getElementById('mapeo-nombre-wrap');
        const faltantesEl = document.getElementById('mapeo-faltantes');
        const superEl = document.getElementById('mapeo-superposicion');
        const btnImportar = document.getElementById('btn-mapeo-importar');
        let superposicion = null;   // { total, coinciden, proporcion } si el tipo es CARGAS
        let consultaSuper = 0;      // para descartar respuestas de una consulta vieja

        const camposDe = (tipo) => tipo === 'OTRA' ? CAMPOS_OTRA : ESQUEMAS[tipo].campos;
        const sugeridoPara = (tipo) => {
            if (tipo === 'OTRA') {
                const m = {};
                const pc = (insp.puntajes || []).find(p => p.tipo === 'CARGAS');
                const id = (insp.puntajes || [])[0]?.mapeo || {};
                if (id.interno) m.interno = id.interno;
                if (id.dominio) m.dominio = id.dominio;
                if (pc?.mapeo?.fecha) m.fecha = pc.mapeo.fecha;
                return m;
            }
            return (insp.puntajes || []).find(p => p.tipo === tipo)?.mapeo || {};
        };

        const mapeoActual = () => {
            const m = {};
            cuerpo.querySelectorAll('select[data-header]').forEach(s => { if (s.value) m[s.value] = s.dataset.header; });
            return m;
        };

        const validar = () => {
            const tipo = selTipo.value;
            const campos = camposDe(tipo);
            const m = mapeoActual();
            const tieneIdentidad = m.interno || m.dominio;
            const faltan = Object.entries(campos)
                .filter(([c, d]) => d.requerido && !m[c] && !(d.identidad && tieneIdentidad))
                .map(([, d]) => d.etiqueta);
            faltantesEl.innerHTML = faltan.length
                ? `<p class="mapeo-alerta"><i class="fa-solid fa-circle-exclamation"></i> Falta indicar: <strong>${faltan.map(esc).join(', ')}</strong>. Sin eso no se puede importar como ${esc(tipo === 'OTRA' ? 'planilla' : ESQUEMAS[tipo].etiqueta)}.</p>`
                : '';
            const nombreOk = tipo !== 'OTRA' || document.getElementById('mapeo-nombre').value.trim();
            btnImportar.disabled = !!faltan.length || !nombreOk;
            return !faltan.length && nombreOk;
        };

        const medirSuperposicion = async () => {
            superposicion = null;
            superEl.innerHTML = '';
            if (selTipo.value !== 'CARGAS') return;
            const m = mapeoActual();
            if (!(m.fecha && m.litros && (m.interno || m.dominio))) return;
            const mia = ++consultaSuper;
            superEl.innerHTML = '<p class="mapeo-info"><i class="fa-solid fa-spinner fa-spin"></i> Comparando contra las cargas ya cargadas…</p>';
            try {
                const r = await superposicionConCargas(file, insp.headerRowIdx, m);
                if (mia !== consultaSuper) return;
                superposicion = r;
                const pct = Math.round(r.proporcion * 100);
                const alto = r.proporcion >= UMBRAL_SUPERPOSICION;
                superEl.innerHTML = `
                    <div class="${alto ? 'mapeo-alerta' : 'mapeo-info'}">
                        <p><i class="fa-solid ${alto ? 'fa-triangle-exclamation' : 'fa-circle-check'}"></i>
                        <strong>${r.coinciden} de ${r.total}</strong> cargas de este archivo (${pct}%) ya están en las cargas cargadas (misma fecha, equipo y litros).
                        ${alto ? 'Es casi seguro un duplicado de la planilla global de combustible.' : ''}</p>
                        <label class="mapeo-radio"><input type="radio" name="mapeo-modo" value="aparte" ${alto ? 'checked' : ''}> Guardar aparte, solo para consultar (no suma litros ni entra al cálculo)</label>
                        <label class="mapeo-radio"><input type="radio" name="mapeo-modo" value="incorporar" ${alto ? '' : 'checked'}> Incorporar al cálculo como Cargas de Combustible${alto ? ' (duplicaría litros)' : ''}</label>
                    </div>`;
            } catch (e) {
                if (mia !== consultaSuper) return;
                superEl.innerHTML = `<p class="mapeo-alerta">No se pudo comparar contra las cargas existentes: ${esc(e.message)}. Por seguridad se guarda aparte.</p>`;
                superposicion = { total: 0, coinciden: 0, proporcion: 1 };
            }
        };

        const pintarColumnas = () => {
            const tipo = selTipo.value;
            const campos = camposDe(tipo);
            const sugerido = sugeridoPara(tipo);
            const campoDeHeader = Object.fromEntries(Object.entries(sugerido).map(([c, h]) => [h, c]));
            nombreWrap.style.display = tipo === 'OTRA' ? '' : 'none';
            cuerpo.innerHTML = insp.columnas.map(col => `
                <tr>
                    <td class="mapeo-header">${esc(col.header)}</td>
                    <td><span class="mapeo-formato mapeo-formato-${esc(col.formato)}">${esc(FORMATO_TXT[col.formato] || col.formato)}</span>${col.detalle ? `<small>${esc(col.detalle)}</small>` : ''}</td>
                    <td class="mapeo-ejemplos">${col.ejemplos.map(e => `<span>${esc(e)}</span>`).join('') || '<em>—</em>'}</td>
                    <td><select data-header="${esc(col.header)}">
                        <option value="">${tipo === 'OTRA' && (col.formato === 'numero') ? '(se suma como dato numérico)' : '— no usar —'}</option>
                        ${Object.entries(campos).map(([c, d]) => `<option value="${c}" ${campoDeHeader[col.header] === c ? 'selected' : ''}>${esc(d.etiqueta)}${d.requerido ? ' *' : ''}</option>`).join('')}
                    </select></td>
                </tr>`).join('');
            cuerpo.querySelectorAll('select[data-header]').forEach(s => s.addEventListener('change', () => {
                // Un campo va a una sola columna: si se elige en otra, se libera la anterior.
                if (s.value) cuerpo.querySelectorAll('select[data-header]').forEach(o => { if (o !== s && o.value === s.value) o.value = ''; });
                validar();
                medirSuperposicion();
            }));
            validar();
            medirSuperposicion();
        };

        const cerrar = (resultado) => { modal.remove(); resolve(resultado); };

        selTipo.addEventListener('change', pintarColumnas);
        document.getElementById('mapeo-nombre').addEventListener('input', validar);
        document.getElementById('btn-mapeo-cerrar').addEventListener('click', () => cerrar(null));
        document.getElementById('btn-mapeo-omitir').addEventListener('click', () => cerrar(null));
        btnImportar.addEventListener('click', () => {
            if (!validar()) return;
            const tipo = selTipo.value;
            let modo = null;
            if (tipo === 'CARGAS') {
                const elegido = superEl.querySelector('input[name="mapeo-modo"]:checked');
                // Sin una medición de superposición terminada, no se incorpora nada al cálculo.
                modo = (elegido ? elegido.value : 'aparte') === 'incorporar' && superposicion ? null : 'aparte';
            }
            cerrar({
                tipo: tipo === 'OTRA' ? null : tipo,
                etiqueta: tipo === 'OTRA' ? document.getElementById('mapeo-nombre').value.trim()
                    : (modo === 'aparte' ? `${insp.generico?.etiqueta || insp.filename} (aparte)` : ESQUEMAS[tipo].etiqueta),
                mapeo: mapeoActual(),
                headerRowIdx: insp.headerRowIdx,
                recordar: document.getElementById('mapeo-recordar').checked,
                modo
            });
        });

        pintarColumnas();
    });
}
