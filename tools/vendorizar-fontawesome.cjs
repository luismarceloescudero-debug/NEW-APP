/**
 * Copia a vendor/fontawesome/ solo lo que la app usa de @fortawesome/fontawesome-free
 * (que vive en devDependencies únicamente para esto): la hoja base, la de solid (el único
 * estilo que usa la app — ver `grep -roh "fa-\(solid\|regular\|brands\)" index.html js/`) y
 * la tipografía solid en woff2/ttf. La versión vendorizada queda commiteada en el repo, así
 * que este script solo hace falta correrlo de nuevo al cambiar de versión de Font Awesome:
 *
 *   npm install --save-dev --save-exact @fortawesome/fontawesome-free@X.Y.Z
 *   npm run vendor:fontawesome
 */
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const SRC = path.join(REPO, 'node_modules', '@fortawesome', 'fontawesome-free');
const DEST = path.join(REPO, 'vendor', 'fontawesome');

if (!fs.existsSync(SRC)) {
    console.error('No está instalado @fortawesome/fontawesome-free. Corré "npm install" primero.');
    process.exit(1);
}

fs.mkdirSync(path.join(DEST, 'css'), { recursive: true });
fs.mkdirSync(path.join(DEST, 'webfonts'), { recursive: true });

const archivos = [
    ['css/fontawesome.min.css', 'css/fontawesome.min.css'],
    ['css/solid.min.css', 'css/solid.min.css'],
    ['webfonts/fa-solid-900.woff2', 'webfonts/fa-solid-900.woff2'],
    ['webfonts/fa-solid-900.ttf', 'webfonts/fa-solid-900.ttf'],
    ['LICENSE.txt', 'LICENSE.txt']
];

for (const [origen, destino] of archivos) {
    fs.copyFileSync(path.join(SRC, origen), path.join(DEST, destino));
    console.log('copiado:', destino);
}

console.log('\nListo. Revisá "git diff vendor/fontawesome" antes de commitear.');
