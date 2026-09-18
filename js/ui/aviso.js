/**
 * Aviso de datos locales (F8 de PLAN4.md / prototipo de Fase 2).
 *
 * Se muestra una sola vez, la primera vez que se abre la app en este navegador, y queda
 * disponible después desde un ícono en el header. Es solo información: no bloquea ni condiciona
 * ningún flujo, y no tiene relación con si hay datos cargados o no.
 */
const CLAVE_VISTO = 'flotacontrol_aviso_datos_visto';

export function yaVioElAviso() {
    try { return localStorage.getItem(CLAVE_VISTO) === '1'; } catch (e) { return false; }
}

function marcarVisto() {
    try { localStorage.setItem(CLAVE_VISTO, '1'); } catch (e) { /* sin localStorage: se vuelve a mostrar la próxima vez, no es grave */ }
}

export function openAvisoDatosLocalesModal() {
    const container = document.getElementById('modals-container');
    if (!container) return;

    const modalHTML = `
        <div class="modal-overlay active" id="aviso-datos-modal">
            <div class="modal-content" style="max-width: 480px;">
                <div class="modal-header">
                    <h2><i class="fa-solid fa-shield-halved" style="color:var(--accent-green)"></i> Tus datos quedan en esta computadora</h2>
                    <button class="btn-close" id="btn-cerrar-aviso-datos"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="modal-body">
                    <p style="color:var(--text-secondary); font-size:0.9rem; line-height:1.6;">
                        FlotaControl procesa las planillas Excel en este navegador y guarda el resultado
                        acá mismo. Nada se sube a un servidor: si cerrás la página, los datos siguen en
                        esta computadora la próxima vez que la abras.
                    </p>
                    <ul style="margin: 0.75rem 0 1.25rem 1.25rem; color:var(--text-secondary); font-size:0.88rem; line-height:1.7;">
                        <li>Los datos <strong>no se sincronizan</strong> entre computadoras por su cuenta.</li>
                        <li>Para pasarlos a otra computadora (o como respaldo), usá <strong>Backup</strong>.</li>
                        <li>Si limpiás el navegador (o usás una ventana privada), los datos se pierden.</li>
                        <li>El asistente IA es opcional y, si se usa, corre en esta misma computadora.</li>
                    </ul>
                    <button id="btn-entendido-aviso" class="btn-primary" style="width:100%;">Entendido</button>
                </div>
            </div>
        </div>
    `;

    container.insertAdjacentHTML('beforeend', modalHTML);
    const cerrar = () => { document.getElementById('aviso-datos-modal')?.remove(); marcarVisto(); };
    document.getElementById('btn-cerrar-aviso-datos')?.addEventListener('click', cerrar);
    document.getElementById('btn-entendido-aviso')?.addEventListener('click', cerrar);
}
