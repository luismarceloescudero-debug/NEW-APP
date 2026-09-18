/**
 * Genera los íconos de la PWA (manifest.webmanifest) sin depender de ninguna librería externa
 * ni de un editor de imágenes: escribe los chunks PNG a mano (IHDR/IDAT/IEND, con su CRC32) y
 * dibuja un glifo simple en una grilla de 16x16 escalada por nearest-neighbor. Reproducible:
 *
 *   node tools/generar-iconos.cjs icons
 *
 * Para cambiar el diseño, editar ROWS (0 = fondo, 1 = blanco, 2 = celeste de acento) y volver
 * a correr. No hace falta ningún paquete de npm.
 */
const zlib = require('zlib');
const fs = require('fs');

function crc32(buf) {
    let c;
    const table = crc32.table || (crc32.table = (() => {
        const t = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            c = n;
            for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            t[n] = c >>> 0;
        }
        return t;
    })());
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function writePNG(path, width, height, pixelFn) {
    const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const ihdrData = Buffer.alloc(13);
    ihdrData.writeUInt32BE(width, 0);
    ihdrData.writeUInt32BE(height, 4);
    ihdrData[8] = 8;  // bit depth
    ihdrData[9] = 6;  // color type RGBA
    ihdrData[10] = 0; ihdrData[11] = 0; ihdrData[12] = 0;
    const ihdr = chunk('IHDR', ihdrData);

    const raw = Buffer.alloc((width * 4 + 1) * height);
    for (let y = 0; y < height; y++) {
        const rowStart = y * (width * 4 + 1);
        raw[rowStart] = 0; // filtro de scanline: ninguno
        for (let x = 0; x < width; x++) {
            const [r, g, b, a] = pixelFn(x, y);
            const off = rowStart + 1 + x * 4;
            raw[off] = r; raw[off + 1] = g; raw[off + 2] = b; raw[off + 3] = a;
        }
    }
    const idat = chunk('IDAT', zlib.deflateSync(raw, { level: 9 }));
    const iend = chunk('IEND', Buffer.alloc(0));
    fs.writeFileSync(path, Buffer.concat([sig, ihdr, idat, iend]));
}

// Paleta del design system (ver styles/main.css: --bg-primary / --accent-blue / --text-primary).
const BG = [10, 14, 26];        // #0a0e1a
const BLUE = [59, 130, 246];    // #3b82f6
const WHITE = [240, 244, 255];  // #f0f4ff

// Glifo: un surtidor/tanque estilizado (cuerpo + boquilla + gota), en una grilla de 16x16.
// 0 = fondo, 1 = blanco (cuerpo), 2 = celeste (acento).
const GRID = 16;
const ROWS = [
    '0000000000000000',
    '0000111111100000',
    '0000122222100000',
    '0000122222100000',
    '0000122222100000',
    '0001222222210000',
    '0001222222210000',
    '0001222222210000',
    '0001222222210000',
    '0000111111100000',
    '0000010000100000',
    '0000010000100000',
    '0000011111100000',
    '0000000000000000',
    '0000000000000000',
    '0000000000000000'
].map(r => r.split('').map(Number));

function generar(path, size, { maskablePadding = 0 } = {}) {
    // maskablePadding: fracción del tamaño reservada como margen seguro (fondo sólido, sin
    // ícono) — un ícono "maskable" puede recortarse en un círculo/redondeado por el sistema
    // operativo, así que el contenido importante tiene que quedar bien adentro del borde.
    const inner = size * (1 - maskablePadding * 2);
    const cell = inner / GRID;
    const offset = size * maskablePadding;
    writePNG(path, size, size, (x, y) => {
        const gx = Math.floor((x - offset) / cell);
        const gy = Math.floor((y - offset) / cell);
        if (gx < 0 || gy < 0 || gx >= GRID || gy >= GRID) return [...BG, 255];
        const v = ROWS[gy][gx];
        if (v === 1) return [...WHITE, 255];
        if (v === 2) return [...BLUE, 255];
        return [...BG, 255];
    });
}

const dir = process.argv[2] || 'icons';
fs.mkdirSync(dir, { recursive: true });
generar(`${dir}/icon-192.png`, 192, { maskablePadding: 0.08 });
generar(`${dir}/icon-512.png`, 512, { maskablePadding: 0.08 });
generar(`${dir}/icon-maskable-512.png`, 512, { maskablePadding: 0.18 });
generar(`${dir}/apple-touch-icon.png`, 180, { maskablePadding: 0.12 });
generar(`${dir}/favicon-32.png`, 32, { maskablePadding: 0.05 });
console.log('Generados en', dir, ':', fs.readdirSync(dir).join(', '));
