/**
 * Panel para una planilla principal que NO es combustible — Fase 7.
 *
 * Regla del usuario: manda la planilla principal y solo se analiza lo que está cargado en
 * ella, identificado por "interno dominio". Si la principal es otra (cubiertas, insumos, otro
 * bien), no hay litros ni consumo que calcular: lo que tiene sentido es, por cada equipo del
 * universo, cuántos registros tiene y el total de cada columna numérica de esa planilla (el
 * importador genérico ya las extrajo en `numericos`), más la actividad GPS del equipo para
 * poder relacionarlas (ej. km por cubierta).
 */
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nf = (n, d = 0) => (Number(n) || 0).toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
const MAX_COLUMNAS = 6;

function etiquetaColumna(slug) {
    const t = String(slug).replace(/_/g, ' ').trim();
    return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

export function renderPanelGenerico(kpiEl, cardsEl, analisis, principal) {
    const t = analisis.totales;
    const filas = analisis.filas;
    const deTipo = (lista) => (lista || []).filter(r => r.type === principal);
    const todos = filas.flatMap(f => deTipo(f.otros));
    const etiqueta = todos[0]?.type_label || principal;

    // Columnas numéricas que más se repiten en la planilla: esas se muestran como totales.
    const usos = new Map();
    todos.forEach(r => Object.entries(r.numericos || {}).forEach(([k, v]) => { if (v) usos.set(k, (usos.get(k) || 0) + 1); }));
    const columnas = [...usos.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_COLUMNAS).map(([k]) => k);

    const porEquipo = filas.map(f => {
        const regs = deTipo(f.otros);
        const sumas = Object.fromEntries(columnas.map(c => [c, regs.reduce((s, r) => s + (r.numericos?.[c] || 0), 0)]));
        const fechas = regs.map(r => r.fecha).filter(Boolean).sort();
        return { f, regs: regs.length, sumas, ultima: fechas[fechas.length - 1] || '', km: f.metrics?.total_km || 0 };
    }).sort((a, b) => b.regs - a.regs);

    const totalesCol = Object.fromEntries(columnas.map(c => [c, porEquipo.reduce((s, e) => s + e.sumas[c], 0)]));
    const fuera = t.universo?.fuera_principal || [];

    kpiEl.innerHTML = `
        <div class="periodo-bar">
            <div class="periodo-info">
                <span class="periodo-label">Planilla principal</span>
                <span class="periodo-valor">${esc(etiqueta)}</span>
            </div>
            <div class="periodo-detalle">Solo se analizan los equipos (interno + dominio) que figuran en esta planilla. Se cambia en Configuración.</div>
        </div>
        <div class="kpi-grid">
            <div class="kpi-card"><div class="kpi-label">Equipos analizados</div><div class="kpi-value">${nf(filas.length)}</div><div class="kpi-sub">figuran en ${esc(etiqueta)}</div></div>
            <div class="kpi-card"><div class="kpi-label">Registros</div><div class="kpi-value">${nf(todos.length)}</div><div class="kpi-sub">filas de ${esc(etiqueta)} en el período</div></div>
            ${columnas.slice(0, 3).map(c => `<div class="kpi-card"><div class="kpi-label">${esc(etiquetaColumna(c))}</div><div class="kpi-value">${nf(totalesCol[c], 1)}</div><div class="kpi-sub">total</div></div>`).join('')}
            <div class="kpi-card"><div class="kpi-label">Fuera del análisis</div><div class="kpi-value">${nf(fuera.length)}</div><div class="kpi-sub">del maestro, no figuran en la planilla</div></div>
        </div>`;

    if (!filas.length) {
        cardsEl.innerHTML = `<div class="empty-state"><i class="fa-solid fa-filter-circle-xmark"></i><h3>Ningún equipo del maestro figura en ${esc(etiqueta)}</h3>
            <p>Revisá que la planilla traiga interno y/o dominio, y que esos códigos existan en el maestro de equipos.</p></div>`;
        return;
    }

    cardsEl.innerHTML = `
        <div class="table-responsive">
            <table class="data-table">
                <thead><tr>
                    <th>Interno dominio</th><th>Denominación</th><th>Registros</th>
                    ${columnas.map(c => `<th>${esc(etiquetaColumna(c))}</th>`).join('')}
                    <th>Km GPS</th><th>Último registro</th>
                </tr></thead>
                <tbody>
                    ${porEquipo.map(e => `<tr>
                        <td><strong>${esc(e.f.identidad || e.f.equipo.interno)}</strong></td>
                        <td>${esc(e.f.equipo.denominacion || '')}</td>
                        <td>${nf(e.regs)}</td>
                        ${columnas.map(c => `<td>${nf(e.sumas[c], 1)}</td>`).join('')}
                        <td>${e.km ? nf(e.km) : '—'}</td>
                        <td>${esc(e.ultima)}</td>
                    </tr>`).join('')}
                </tbody>
            </table>
        </div>`;
}
