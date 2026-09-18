/* Servidor local sin dependencias: frontend estático + función /api/chat. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const handler = require('../api/chat.js');

const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 8080);

function cargarEnvLocal() {
    const archivo = path.join(root, '.env');
    if (!fs.existsSync(archivo)) return;
    for (const linea of fs.readFileSync(archivo, 'utf8').split(/\r?\n/)) {
        const match = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!match || process.env[match[1]]) continue;
        process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
}

function tipoContenido(archivo) {
    return {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon'
    }[path.extname(archivo).toLowerCase()] || 'application/octet-stream';
}

function responderApi(res) {
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (value) => {
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(value));
    };
}

async function servirApi(req, res) {
    let raw = '';
    for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 150000) {
            res.statusCode = 413;
            res.end('Payload demasiado grande');
            return;
        }
    }
    try { req.body = raw ? JSON.parse(raw) : {}; } catch (e) { req.body = {}; }
    responderApi(res);
    await handler(req, res);
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

cargarEnvLocal();
// El servidor solo escucha para desarrollo local; así se puede probar el frontend sin crear
// una clave antes de configurar el proveedor IA. Un despliegue nunca usa este valor.
if (!process.env.APP_SHARED_SECRET) process.env.APP_SHARED_SECRET = 'CONFIGURE_REMOTE_AUTHENTICATION_FIRST';
http.createServer((req, res) => {
    if ((req.url || '').split('?')[0] === '/api/chat') {
        servirApi(req, res).catch(error => {
            console.error('Error en /api/chat:', error);
            if (!res.headersSent) { res.statusCode = 500; res.end('Error interno'); }
        });
        return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; res.end('Method not allowed'); return; }
    servirArchivo(req, res);
}).listen(port, '0.0.0.0', () => {
    console.log(`FlotaControl local: http://localhost:${port}`);
    console.log(`Proveedor IA: ${process.env.AI_PROVIDER || 'anthropic'}`);
});
