/* Servidor local sin dependencias: sirve el frontend estático para desarrollo.
 *
 * FASE 1 (18/09/2026): ya no monta /api/chat — ese backend remoto se sacó del release (ver
 * extras/remote-chat/README.md). `index.html` no funciona abriéndolo con doble clic
 * (file://: el navegador bloquea los ES modules por CORS), así que este servidor sigue
 * haciendo falta para desarrollar, aunque ahora es más simple: solo sirve archivos. */
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 8080);

function tipoContenido(archivo) {
    return {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.svg': 'image/svg+xml',
        '.webmanifest': 'application/manifest+json; charset=utf-8',
        '.ico': 'image/x-icon'
    }[path.extname(archivo).toLowerCase()] || 'application/octet-stream';
}

function servirArchivo(req, res) {
    const solicitado = decodeURIComponent((req.url || '/').split('?')[0]);
    const relativo = solicitado === '/' ? '/index.html' : solicitado;
    const archivo = path.resolve(root, `.${relativo}`);
    if (!archivo.startsWith(root + path.sep)) { res.statusCode = 403; res.end('Forbidden'); return; }
    fs.stat(archivo, (error, stat) => {
        if (error || !stat.isFile()) { res.statusCode = 404; res.end('Not found'); return; }
        res.setHeader('content-type', tipoContenido(archivo));
        fs.createReadStream(archivo).pipe(res);
    });
}

http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; res.end('Method not allowed'); return; }
    servirArchivo(req, res);
}).listen(port, '0.0.0.0', () => {
    console.log(`FlotaControl local: http://localhost:${port}`);
    console.log('IA: configurala en la app (Ollama corriendo en esta misma computadora).');
});
