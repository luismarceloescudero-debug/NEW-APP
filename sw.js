/**
 * Service worker de FlotaControl — Fase 4 (PWA).
 *
 * Objetivo: que la app abra y funcione sin conexión después de la primera visita. No hay
 * build step que genere esta lista automáticamente, así que se mantiene a mano: agregar un
 * archivo nuevo (un módulo en js/, una hoja de estilo) implica sumarlo acá. Como red de
 * seguridad, cualquier otro pedido del mismo origen que la app haga y todavía no esté
 * cacheado se cachea solo la primera vez que se pide con éxito (ver `cachearSiFalta` más
 * abajo), así un archivo que se olvidó en esta lista igual queda disponible offline después
 * de la primera visita online.
 *
 * CACHE_VERSION: subir este número en cada release para que los navegadores con la versión
 * vieja en caché bajen la nueva la próxima vez que abran la app con internet (`activate`
 * borra los caches de versiones anteriores).
 */
const CACHE_VERSION = 'flotacontrol-v3';

const PRECACHE = [
    './',
    './index.html',
    './manifest.webmanifest',
    './xlsx.full.min.js',
    './styles/main.css',
    './styles/upload.css',
    './styles/components.css',
    './styles/panel.css',
    './vendor/fontawesome/css/fontawesome.min.css',
    './vendor/fontawesome/css/solid.min.css',
    './vendor/fontawesome/webfonts/fa-solid-900.woff2',
    './vendor/fontawesome/webfonts/fa-solid-900.ttf',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-maskable-512.png',
    './icons/apple-touch-icon.png',
    './icons/favicon-32.png',
    './js/app.js',
    './js/ai/chat.js',
    './js/ai/ollama.js',
    './js/data/alcance.js',
    './js/data/analyzer.js',
    './js/data/autocorreccion.js',
    './js/data/database.js',
    './js/data/diagnostico.js',
    './js/data/feriados.js',
    './js/data/normalizer.js',
    './js/parsers/esquemas.js',
    './js/parsers/index.js',
    './js/parsers/xlsx-parser.js',
    './js/ui/aviso.js',
    './js/ui/backup.js',
    './js/ui/calcpopover.js',
    './js/ui/comparativa.js',
    './js/ui/config.js',
    './js/ui/datatable.js',
    './js/ui/metas.js',
    './js/ui/modals.js',
    './js/ui/mapeo.js',
    './js/ui/panel-generico.js',
    './js/ui/panel.js',
    './js/ui/seguimiento.js',
    './js/ui/upload.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_VERSION)
            .then((cache) => cache.addAll(PRECACHE))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((nombres) => Promise.all(
                nombres.filter((n) => n !== CACHE_VERSION).map((n) => caches.delete(n))
            ))
            .then(() => self.clients.claim())
    );
});

// Cachea una respuesta exitosa que no estaba en PRECACHE, para que un archivo agregado
// después de esta lista igual quede disponible offline tras pedirse una vez con éxito.
async function cachearSiFalta(request, response) {
    if (!response || !response.ok) return response;
    try {
        const cache = await caches.open(CACHE_VERSION);
        cache.put(request, response.clone());
    } catch (e) { /* best-effort: si falla el cacheo, la respuesta igual se devuelve */ }
    return response;
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    // Solo GET del mismo origen: nunca cachear /api ni un origen ajeno (esta app no tiene
    // backend propio, pero Ollama corre en otro origen/puerto y no debe pasar por acá).
    if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

    // Navegación (F5, escribir la URL, abrir desde el ícono instalado): red primero, con la
    // página cacheada como respaldo si no hay conexión. Así una actualización se ve enseguida
    // cuando hay internet, y la app igual abre sin conexión.
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((resp) => cachearSiFalta(request, resp))
                .catch(() => caches.match('./index.html'))
        );
        return;
    }

    // Todo lo demás (JS, CSS, fuentes, íconos): caché primero, red como respaldo.
    event.respondWith(
        caches.match(request).then((cacheada) => {
            if (cacheada) return cacheada;
            return fetch(request)
                .then((resp) => cachearSiFalta(request, resp))
                .catch(() => cacheada); // undefined si tampoco estaba cacheada: el navegador reporta el error normal
        })
    );
});
