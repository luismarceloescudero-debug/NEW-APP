/**
 * Backup y restauración (Fase 3 de PLAN4.md).
 *
 * FlotaControl no tiene servidor: todo lo editado a mano (maestro, correcciones, seguimiento,
 * metas, referentes) vive únicamente en el IndexedDB de este navegador. Si se limpia el
 * navegador, se cambia de computadora o se abre en modo incógnito, ese trabajo se pierde sin
 * este archivo. El formato es el mismo que describe PLAN4.md sección 6:
 *   { formatVersion, dbVersion, appVersion, exportedAt, stores: {...} }
 *
 * Restaurar es DESTRUCTIVO: reemplaza el contenido de cada store que trae el backup por lo que
 * hay en el archivo (ver importarBackup() en database.js). Por eso el botón de confirmar queda
 * deshabilitado hasta elegir un archivo válido, y avisa explícitamente que no se puede deshacer.
 */
import { exportarBackup, importarBackup, validarBackup, getAllEquipos, getAllRawRecords } from '../data/database.js';

const APP_VERSION = '1.0.0';
const CLAVE_ULTIMO_BACKUP = 'flotacontrol_ultimo_backup';

function leerUltimoBackup() {
    try {
        const raw = localStorage.getItem(CLAVE_ULTIMO_BACKUP);
        return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
}

function guardarUltimoBackup(info) {
    try { localStorage.setItem(CLAVE_ULTIMO_BACKUP, JSON.stringify(info)); } catch (e) { /* localStorage no disponible: solo se pierde el aviso, no el backup en sí */ }
}

function formatearFecha(iso) {
    if (!iso) return null;
    try {
        return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return iso; }
}

function diasDesde(iso) {
    if (!iso) return null;
    const ms = Date.now() - new Date(iso).getTime();
    return Math.floor(ms / 86400000);
}

export function openBackupModal() {
    const container = document.getElementById('modals-container');
    if (!container) return;

    const ultimo = leerUltimoBackup();
    const dias = diasDesde(ultimo?.fecha);
    const avisoViejo = dias !== null && dias >= 7;

    const modalHTML = `
        <div class="modal-overlay active" id="backup-modal">
            <div class="modal-content" style="max-width: 560px;">
                <div class="modal-header">
                    <h2><i class="fa-solid fa-box-archive"></i> Backup y restauración</h2>
                    <button class="btn-close" id="btn-cerrar-backup"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="modal-body">

                    <div class="backup-section">
                        <h3><i class="fa-solid fa-clock-rotate-left"></i> Último backup</h3>
                        ${ultimo
                            ? `<p class="backup-info">${formatearFecha(ultimo.fecha)} · ${ultimo.equipos} equipos${ultimo.incluyeMovimientos ? `, ${ultimo.movimientos} movimientos` : ''}</p>
                               <p class="backup-muted ${avisoViejo ? 'backup-warn' : ''}"><i class="fa-solid ${avisoViejo ? 'fa-triangle-exclamation' : 'fa-circle-info'}"></i> ${dias === 0 ? 'hoy' : `hace ${dias} día${dias === 1 ? '' : 's'}`}${avisoViejo ? ' — conviene hacer uno nuevo' : ''}</p>`
                            : `<p class="backup-muted"><i class="fa-solid fa-circle-info"></i> Todavía no se hizo ningún backup desde este navegador.</p>`}
                    </div>

                    <div class="backup-section">
                        <h3><i class="fa-solid fa-download"></i> Exportar</h3>
                        <p class="backup-desc">Genera un archivo <code>.json</code> con el maestro, metas, correcciones,
                            seguimiento, referentes, configuración y mapeos guardados en este navegador.</p>
                        <label class="backup-checkbox">
                            <input type="checkbox" id="backup-incluir-mov">
                            Incluir también los movimientos ya procesados (cargas, GPS de esta sesión)
                        </label>
                        <button id="btn-exportar-backup" class="btn-primary"><i class="fa-solid fa-file-arrow-down"></i> Descargar backup</button>
                        <div id="backup-export-result" class="backup-result"></div>
                    </div>

                    <div class="backup-section">
                        <h3><i class="fa-solid fa-upload"></i> Restaurar</h3>
                        <p class="backup-desc">Reemplaza lo guardado en este navegador por el contenido de un backup.
                            Se valida el formato antes de tocar cualquier dato.</p>
                        <div id="backup-dropzone" class="backup-dropzone">
                            <i class="fa-solid fa-file-arrow-up"></i>
                            <span>Arrastrá un archivo de backup (.json) o hacé clic para elegirlo</span>
                            <input type="file" id="backup-file-input" accept="application/json,.json" hidden>
                        </div>
                        <div id="backup-import-preview"></div>
                        <div class="backup-warning">
                            <i class="fa-solid fa-triangle-exclamation"></i>
                            Esto reemplaza los datos actuales de este navegador. No se puede deshacer.
                        </div>
                        <button id="btn-restaurar-backup" class="btn-secondary" disabled>Restaurar backup</button>
                        <div id="backup-import-result" class="backup-result"></div>
                    </div>

                </div>
            </div>
        </div>
    `;

    container.insertAdjacentHTML('beforeend', modalHTML);
    document.getElementById('btn-cerrar-backup')?.addEventListener('click', () => {
        document.getElementById('backup-modal')?.remove();
    });
    wireExportar();
    wireRestaurar();
}

function wireExportar() {
    const btn = document.getElementById('btn-exportar-backup');
    const checkbox = document.getElementById('backup-incluir-mov');
    const resultEl = document.getElementById('backup-export-result');

    btn.addEventListener('click', async () => {
        btn.disabled = true;
        resultEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generando...';
        try {
            const incluirMovimientos = checkbox.checked;
            const backup = await exportarBackup({ incluirMovimientos, appVersion: APP_VERSION });

            const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const fecha = new Date().toISOString().slice(0, 10);
            const a = document.createElement('a');
            a.href = url;
            a.download = `flotacontrol-backup-${fecha}.json`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);

            const equipos = backup.stores.equipos?.length || 0;
            const movimientos = backup.stores.raw_records?.length || 0;
            guardarUltimoBackup({ fecha: backup.exportedAt, equipos, movimientos, incluyeMovimientos: incluirMovimientos });

            resultEl.innerHTML = `<span class="backup-ok"><i class="fa-solid fa-check-circle"></i> Backup descargado: ${equipos} equipos${incluirMovimientos ? `, ${movimientos} movimientos` : ''}.</span>`;
        } catch (e) {
            console.error('Error exportando backup:', e);
            resultEl.innerHTML = `<span class="backup-error"><i class="fa-solid fa-triangle-exclamation"></i> No se pudo generar el backup: ${e.message}</span>`;
        } finally {
            btn.disabled = false;
        }
    });
}

function wireRestaurar() {
    const dropzone = document.getElementById('backup-dropzone');
    const fileInput = document.getElementById('backup-file-input');
    const previewEl = document.getElementById('backup-import-preview');
    const btnRestaurar = document.getElementById('btn-restaurar-backup');
    const resultEl = document.getElementById('backup-import-result');

    let archivoValidado = null; // { data, nombre } — solo se habilita restaurar si esto está seteado

    const procesarArchivo = (file) => {
        archivoValidado = null;
        btnRestaurar.disabled = true;
        resultEl.innerHTML = '';
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
            let data;
            try {
                data = JSON.parse(reader.result);
            } catch (e) {
                previewEl.innerHTML = `<p class="backup-error"><i class="fa-solid fa-triangle-exclamation"></i> "${file.name}" no es un JSON válido.</p>`;
                return;
            }
            const errores = validarBackup(data);
            if (errores.length) {
                previewEl.innerHTML = `<p class="backup-error"><i class="fa-solid fa-triangle-exclamation"></i> ${errores.join('<br>')}</p>`;
                return;
            }
            const equipos = data.stores.equipos?.length ?? 0;
            const movimientos = data.stores.raw_records?.length;
            previewEl.innerHTML = `<p class="backup-ok"><i class="fa-solid fa-check"></i> "${file.name}" — ${formatearFecha(data.exportedAt) || 'fecha desconocida'} · ${equipos} equipos${movimientos ? `, ${movimientos} movimientos` : ''}.</p>`;
            archivoValidado = data;
            btnRestaurar.disabled = false;
        };
        reader.onerror = () => {
            previewEl.innerHTML = `<p class="backup-error"><i class="fa-solid fa-triangle-exclamation"></i> No se pudo leer "${file.name}".</p>`;
        };
        reader.readAsText(file);
    };

    dropzone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => procesarArchivo(fileInput.files[0]));
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('backup-dropzone-active'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('backup-dropzone-active'));
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('backup-dropzone-active');
        procesarArchivo(e.dataTransfer.files[0]);
    });

    btnRestaurar.addEventListener('click', async () => {
        if (!archivoValidado) return;
        const equiposActuales = await getAllEquipos().catch(() => []);
        const movActuales = await getAllRawRecords().catch(() => []);
        const confirmado = confirm(
            `Vas a reemplazar ${equiposActuales.length} equipos y ${movActuales.length} movimientos actuales ` +
            `por el contenido del backup. Esta acción no se puede deshacer.\n\n¿Confirmás?`
        );
        if (!confirmado) return;

        btnRestaurar.disabled = true;
        resultEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Restaurando...';
        try {
            const resumen = await importarBackup(archivoValidado);
            resultEl.innerHTML = `<span class="backup-ok"><i class="fa-solid fa-check-circle"></i> Restaurado: ${resumen.totalFilas} filas en ${resumen.storesRestaurados.length} tablas. Recargando...</span>`;
            setTimeout(() => location.reload(), 1200);
        } catch (e) {
            console.error('Error restaurando backup:', e);
            resultEl.innerHTML = `<span class="backup-error"><i class="fa-solid fa-triangle-exclamation"></i> No se pudo restaurar: ${e.message}</span>`;
            btnRestaurar.disabled = false;
        }
    });
}
