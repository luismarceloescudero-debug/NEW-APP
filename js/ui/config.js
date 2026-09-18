/**
 * Modal de Configuración.
 *
 * FASE 1 (18/09/2026): se cortó el backend remoto /api/chat (Claude vía Anthropic) — el
 * secreto que lo protegía viajaba en el JS del navegador y en un repo público cualquiera
 * puede leerlo. Ese código sigue disponible en extras/remote-chat/ por si se reactiva con
 * autenticación real. Mientras tanto este modal informa el estado real: sin IA configurada.
 * FASE 5 (pendiente): acá va a vivir la config de Ollama (URL, modelo).
 */
export function openConfigModal() {
    let container = document.getElementById('modals-container');
    if (!container) return;

    const modalHTML = `
        <div class="modal-overlay active" id="config-modal">
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h2>Configuración del Sistema</h2>
                    <button class="btn-close" id="btn-cerrar-config"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="modal-body">
                    <div style="margin-bottom: 1.5rem;">
                        <label style="display:block; margin-bottom: 0.5rem; color: var(--text-secondary);">Asistente IA</label>
                        <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:0.75rem;">
                            <i class="fa-solid fa-circle-info"></i> IA no configurada en este release.
                            El análisis de la flota (carga de planillas, cálculo, panel, hallazgos) no
                            depende de la IA y funciona igual sin ella.
                        </p>
                        <p style="font-size:0.8rem; color:var(--text-muted);">
                            Cuando esté disponible, el asistente va a correr con
                            <a href="https://ollama.com" target="_blank" rel="noopener noreferrer">Ollama</a>
                            en esta misma computadora: sin API key, sin costo por uso y sin enviar datos
                            de la flota a ningún servidor.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    `;

    container.insertAdjacentHTML('beforeend', modalHTML);
    document.getElementById('btn-cerrar-config')?.addEventListener('click', () => {
        document.getElementById('config-modal')?.remove();
    });
}
