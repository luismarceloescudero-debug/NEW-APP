/**
 * Modal de Configuración.
 *
 * FASE 1 (18/09/2026): se cortó el backend remoto /api/chat (Claude vía Anthropic) — el
 * secreto que lo protegía viajaba en el JS del navegador y en un repo público cualquiera
 * puede leerlo. Ese código sigue disponible en extras/remote-chat/ por si se reactiva con
 * autenticación real.
 * FASE 5 (18/09/2026): acá vive la config de Ollama (URL, modelo). Se guarda en localStorage
 * de este navegador (js/ai/ollama.js) — nunca en el repo, nunca en ningún servidor.
 */
import { getOllamaConfig, setOllamaConfig, isAvailable, listModels } from '../ai/ollama.js';

export function openConfigModal() {
    let container = document.getElementById('modals-container');
    if (!container) return;

    const { baseUrl, model } = getOllamaConfig();

    const modalHTML = `
        <div class="modal-overlay active" id="config-modal">
            <div class="modal-content" style="max-width: 520px;">
                <div class="modal-header">
                    <h2>Configuración del Sistema</h2>
                    <button class="btn-close" id="btn-cerrar-config"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="modal-body">
                    <div style="margin-bottom: 1.25rem;">
                        <label style="display:block; margin-bottom: 0.5rem; color: var(--text-secondary);">Asistente IA — Ollama</label>
                        <p style="font-size:0.8rem; color:var(--text-muted); margin-bottom:0.75rem;">
                            Corre en esta misma computadora: sin API key, sin costo por uso y sin enviar
                            datos de la flota a ningún servidor. El análisis de la flota (carga, cálculo,
                            panel, hallazgos) no depende de esto y funciona igual sin IA.
                            <a href="https://ollama.com" target="_blank" rel="noopener noreferrer">Instalar Ollama</a>.
                        </p>

                        <label for="cfg-ollama-url" style="display:block; font-size:0.8rem; color:var(--text-secondary); margin-bottom:0.25rem;">URL de Ollama</label>
                        <input type="text" id="cfg-ollama-url" value="${esc(baseUrl)}" placeholder="http://127.0.0.1:11434"
                            style="width:100%; padding:0.5rem; margin-bottom:0.75rem; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-input); color:var(--text-primary);">

                        <label for="cfg-ollama-modelo" style="display:block; font-size:0.8rem; color:var(--text-secondary); margin-bottom:0.25rem;">Modelo</label>
                        <select id="cfg-ollama-modelo" style="width:100%; padding:0.5rem; margin-bottom:0.75rem; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-input); color:var(--text-primary);">
                            ${model ? `<option value="${esc(model)}" selected>${esc(model)}</option>` : '<option value="">(elegir después de detectar)</option>'}
                        </select>

                        <div style="display:flex; gap:0.5rem; margin-bottom:0.75rem;">
                            <button id="btn-detectar-ollama" class="btn-secondary btn-sm" style="flex:1;"><i class="fa-solid fa-magnifying-glass"></i> Detectar</button>
                            <button id="btn-guardar-ollama" class="btn-primary btn-sm" style="flex:1;"><i class="fa-solid fa-floppy-disk"></i> Guardar</button>
                        </div>
                        <div id="cfg-ollama-resultado" style="font-size:0.85rem;"></div>
                    </div>
                </div>
            </div>
        </div>
    `;

    container.insertAdjacentHTML('beforeend', modalHTML);
    document.getElementById('btn-cerrar-config')?.addEventListener('click', () => {
        document.getElementById('config-modal')?.remove();
    });

    const resultEl = document.getElementById('cfg-ollama-resultado');
    const urlInput = document.getElementById('cfg-ollama-url');
    const selectModelo = document.getElementById('cfg-ollama-modelo');

    document.getElementById('btn-detectar-ollama')?.addEventListener('click', async () => {
        const url = urlInput.value.trim() || 'http://127.0.0.1:11434';
        resultEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Buscando Ollama...';
        try {
            const disponible = await isAvailable(url);
            if (!disponible) {
                resultEl.innerHTML = `<span style="color:var(--accent-amber)"><i class="fa-solid fa-triangle-exclamation"></i> No respondió nada en ${esc(url)}. ¿Está instalado y corriendo?</span>`;
                return;
            }
            const modelos = await listModels(url);
            if (!modelos.length) {
                resultEl.innerHTML = '<span style="color:var(--accent-amber)"><i class="fa-solid fa-triangle-exclamation"></i> Ollama responde, pero no tiene ningún modelo descargado. Ejecutá <code>ollama pull qwen2.5:7b</code>.</span>';
                return;
            }
            selectModelo.innerHTML = modelos.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('');
            resultEl.innerHTML = `<span style="color:var(--accent-green)"><i class="fa-solid fa-check-circle"></i> ${modelos.length} modelo(s) encontrado(s).</span>`;
        } catch (e) {
            resultEl.innerHTML = `<span style="color:var(--accent-red)"><i class="fa-solid fa-triangle-exclamation"></i> ${esc(e.message)}</span>`;
        }
    });

    document.getElementById('btn-guardar-ollama')?.addEventListener('click', () => {
        const url = urlInput.value.trim() || 'http://127.0.0.1:11434';
        const modeloElegido = selectModelo.value;
        setOllamaConfig({ baseUrl: url, model: modeloElegido });
        resultEl.innerHTML = '<span style="color:var(--accent-green)"><i class="fa-solid fa-check"></i> Guardado. Se usa desde el próximo mensaje al asistente.</span>';
    });
}

function esc(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
}
