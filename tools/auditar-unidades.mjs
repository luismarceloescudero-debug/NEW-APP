/**
 * Arnés de UNIDADES Y FORMATOS.
 *
 * Los otros tres arneses preguntan cosas distintas de esta:
 *  - `verificar-datos-reales.mjs` → "¿los totales siguen siendo los de ayer?"
 *  - `auditar-calculos.mjs`       → "¿cada número se re-deriva de su propia definición?"
 *  - `auditar-declarados.mjs`     → "¿las funciones puras siguen dando lo mismo?"
 *
 * Ninguno pregunta **"¿los dos lados de este cruce están en la misma unidad y en el mismo
 * formato?"**, que es la falla más silenciosa de todas: un número en la unidad equivocada no
 * rompe nada, no lanza un error y sigue imprimiendo una cifra plausible. Una hora leída como
 * fracción de día sale 24 veces más chica; un serial de fecha de Excel leído como importe pasa
 * por un gasto creíble.
 *
 * Este arnés hace tres cosas, en este orden — que es justamente el orden que pidió el usuario:
 *   1. MIRAR el formato real de cada campo que participa de un cruce (tipo, rango, unidad).
 *   2. NORMALIZAR a una unidad común declarada (horas, litros, km, pesos, m³).
 *   3. CRUZAR y exigir que los dos lados cierren.
 *
 * Uso:
 *   node tools/auditar-unidades.mjs
 *
 * Sale con código ≠ 0 si algún chequeo falla. Los AVISOS no hacen fallar: son cosas que hay que
 * mirar pero que pueden ser legítimas.
 */
import 'fake-indexeddb/auto';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const ARCHIVOS_CANDIDATOS = [
    process.env.FLOTACONTROL_ARCHIVOS,
    path.resolve(REPO, '..', 'ARCHIVOS'),
    path.resolve(REPO, '..', 'CONSUMO DE COMBUSTIBLE', 'ARCHIVOS'),
    path.resolve(REPO, '..', '..', 'ARCHIVOS')
].filter(Boolean).map(p => path.resolve(p));
const ARCHIVOS = ARCHIVOS_CANDIDATOS.find(existsSync);

if (!ARCHIVOS) {
    console.error('No encontré la carpeta ARCHIVOS con los Excel reales.');
    console.error('Definí FLOTACONTROL_ARCHIVOS o dejala en alguna de estas rutas:');
    ARCHIVOS_CANDIDATOS.forEach(p => console.error('  ' + p));
    process.exit(1);
}

globalThis.XLSX = require(path.join(REPO, 'xlsx.full.min.js'));

class FileReaderShim {
    readAsArrayBuffer(file) {
        const buf = file.__buffer;
        const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        queueMicrotask(() => this.onload && this.onload({ target: { result: ab } }));
    }
}
globalThis.FileReader = FileReaderShim;

// ---------------------------------------------------------------- unidades declaradas
/**
 * La unidad de cada campo, DECLARADA acá una sola vez. Es el contrato: si un campo cambia de
 * unidad en el parser, este arnés falla — que es exactamente lo que tiene que pasar.
 *
 * Los rangos no son gustos: salen de la física del equipo y del calendario.
 *  - Un mes tiene como mucho 744 h (31 × 24). Un valor <= 31 en un campo de horas mensuales es
 *    la señal clásica de una fracción de día de Excel sin convertir.
 *  - El precio del gasoil en 2026 se mueve entre ~2.100 y ~2.430 $/L (verificado sobre las
 *    4.843 cargas reales: una única serie de precios por combustible).
 */
const UNIDADES = {
    'carga.litros':          { unidad: 'L',      min: 0.1,  max: 2000,     obligatorio: true },
    'carga.importe':         { unidad: '$',      min: 1,    max: 20000000, obligatorio: true },
    'carga.precio_unitario': { unidad: '$/L',    min: 100,  max: 10000,    obligatorio: false },
    'gps.distancia':         { unidad: 'km',     min: 0,    max: 30000,    obligatorio: false },
    'gps.horas.total':       { unidad: 'h/mes',  min: 0,    max: 744,      obligatorio: false },
    'gps.horas.ralenti':     { unidad: 'h/mes',  min: 0,    max: 744,      obligatorio: false },
    'gps.horas.movimiento':  { unidad: 'h/mes',  min: 0,    max: 744,      obligatorio: false },
    'entrega.volumen':       { unidad: 'm3',     min: 0,    max: 100,      obligatorio: false }
};

// Rango de seriales de fecha de Excel para los años que maneja la app (2020-2035).
// Sirve para detectar un serial de fecha disfrazado de otra cosa.
const SERIAL_MIN = 43831;  // 2020-01-01
const SERIAL_MAX = 49673;  // 2035-12-31

const fallos = [];
const avisos = [];
let chequeos = 0;

const fallar = (grupo, msg) => { fallos.push(`[${grupo}] ${msg}`); };
const avisar = (grupo, msg) => { avisos.push(`[${grupo}] ${msg}`); };
const chequear = (cond, grupo, msg) => { chequeos++; if (!cond) fallar(grupo, msg); };

// ---------------------------------------------------------------- 1. cargar
function fakeFile(nombre) {
    return { name: nombre, __buffer: readFileSync(path.join(ARCHIVOS, nombre)) };
}

const logReal = console.log;
console.log = () => {};   // el parser es verboso; lo silenciamos durante la carga
const { initDB, getAllRawRecords, getAllEquipos } = await import('../js/data/database.js');
await initDB();
const { parseXLSX } = await import('../js/parsers/xlsx-parser.js');
for (const f of readdirSync(ARCHIVOS)) {
    if (!/\.xlsx$/i.test(f)) continue;
    try { await parseXLSX(fakeFile(f)); } catch (e) { console.log = logReal; avisar('carga', `no se pudo leer ${f}: ${e.message}`); console.log = () => {}; }
}
console.log = logReal;

const recs = await getAllRawRecords();
const equipos = await getAllEquipos();
const cargas = recs.filter(r => r.type === 'carga');
const gps = recs.filter(r => r.type === 'gps');
const entregas = recs.filter(r => r.type === 'entrega');

console.log(`\n=== AUDITORIA DE UNIDADES Y FORMATOS ===`);
console.log(`Archivos: ${ARCHIVOS}`);
console.log(`Cargas: ${cargas.length} · GPS: ${gps.length} · Entregas: ${entregas.length} · Maestro: ${equipos.length}\n`);

// ---------------------------------------------------------------- 2. formato de cada campo
/**
 * ¿Este número es, exactamente, una celda de fecha de su propia fila?
 *
 * `r.datos` conserva todas las columnas originales del Excel. Si el valor coincide al bit con
 * el de una columna cuyo encabezado habla de fecha (FECHA, DMA, DIA...), no es una coincidencia
 * numérica: es la misma celda copiada en la columna equivocada.
 */
function esFechaDeSuPropiaFila(r, valor, rutaPropia) {
    const datos = r.datos || {};
    const campoPropio = rutaPropia.split('.').pop();
    for (const [col, v] of Object.entries(datos)) {
        if (typeof v !== 'number' || Math.abs(v - valor) > 1e-9) continue;
        const enc = String(col).toUpperCase();
        if (/FECHA|DMA|\bDIA\b|DATE/.test(enc) && !enc.includes(campoPropio.toUpperCase())) return true;
    }
    return false;
}

/** Devuelve el valor de un campo, soportando 'gps.horas.total' → r.horas.total */
function leer(r, ruta) {
    const partes = ruta.split('.').slice(1);   // saca el prefijo del tipo
    let v = r;
    for (const p of partes) { if (v == null) return undefined; v = v[p]; }
    return v;
}

for (const [ruta, def] of Object.entries(UNIDADES)) {
    const tipo = ruta.split('.')[0];
    const filas = tipo === 'carga' ? cargas : tipo === 'gps' ? gps : entregas;
    if (!filas.length) continue;

    const valores = filas.map(r => leer(r, ruta));
    const numericos = valores.filter(v => typeof v === 'number' && isFinite(v));
    const noNumericos = valores.filter(v => v !== undefined && v !== null && v !== '' && typeof v !== 'number');

    chequear(noNumericos.length === 0, 'formato',
        `${ruta} (${def.unidad}): ${noNumericos.length} valores no numéricos — ej: ${JSON.stringify(noNumericos[0])}`);

    if (def.obligatorio) {
        const faltantes = valores.filter(v => v === undefined || v === null || v === '' || v === 0).length;
        chequear(faltantes === 0, 'formato', `${ruta} (${def.unidad}): ${faltantes} filas sin valor`);
    }

    if (!numericos.length) continue;
    const min = Math.min(...numericos), max = Math.max(...numericos);
    chequear(min >= def.min, 'unidad', `${ruta} (${def.unidad}): mínimo ${min} por debajo de ${def.min}`);
    chequear(max <= def.max, 'unidad',
        `${ruta} (${def.unidad}): máximo ${max} por encima de ${def.max} — revisar si la unidad es la declarada`);

    // Serial de fecha disfrazado. Caer en el rango de seriales NO alcanza como señal: un importe
    // de $48.000 cae ahí y es perfectamente legítimo (28 casos reales en estas cargas). La señal
    // fuerte, la que no tiene explicación inocente, es que el valor coincida **exacto** con una
    // celda de fecha de su PROPIA fila: ahí no es una coincidencia numérica, es la misma celda
    // copiada. (Caso real: la fila 4747 de Cargas_2026 tiene FECHA, DMA y COSTO TOTAL con el
    // mismo 46281.43541666667.)
    if (def.unidad !== 'h/mes') {
        const sospechosas = filas.filter(r => {
            const v = leer(r, ruta);
            if (typeof v !== 'number' || v < SERIAL_MIN || v > SERIAL_MAX) return false;
            return esFechaDeSuPropiaFila(r, v, ruta);
        });
        if (sospechosas.length) {
            fallar('serial-fecha', `${ruta}: ${sospechosas.length} valor(es) idénticos a una celda de fecha de su propia fila ` +
                `— no son un ${def.unidad}, son una fecha mal cargada. ej: ${sospechosas[0].interno} ${sospechosas[0].fecha} = ${leer(sospechosas[0], ruta)}`);
        }
    }
}

// ---------------------------------------------------------------- 3. fechas: un solo formato
for (const [nombre, filas] of [['cargas', cargas], ['gps', gps], ['entregas', entregas]]) {
    if (!filas.length) continue;
    const malas = filas.filter(r => r.fecha && !/^\d{4}-\d{2}-\d{2}$/.test(String(r.fecha)));
    chequear(malas.length === 0, 'fecha',
        `${nombre}: ${malas.length} fechas fuera de ISO YYYY-MM-DD — ej: ${JSON.stringify(malas[0]?.fecha)}`);
}
// Los GPS declaran rango: fecha_hasta nunca puede ser anterior a fecha.
const rangosMal = gps.filter(r => r.fecha_hasta && r.fecha && String(r.fecha_hasta) < String(r.fecha));
chequear(rangosMal.length === 0, 'fecha', `gps: ${rangosMal.length} reportes con fecha_hasta anterior a fecha`);

// ---------------------------------------------------------------- 4. cruces: los dos lados cierran
// 4a. Moneda: importe = litros × precio unitario.
let cerrados = 0;
const noCierran = [];
for (const c of cargas) {
    const l = Number(c.litros) || 0, pu = Number(c.precio_unitario) || 0, im = Number(c.importe) || 0;
    if (!l || !pu) continue;
    const esperado = l * pu;
    if (Math.abs(esperado - im) / Math.max(esperado, 1) <= 0.02) cerrados++;
    else noCierran.push({ c, esperado, im });
}
chequeos++;
if (noCierran.length) {
    const detalle = noCierran.slice(0, 5).map(({ c, esperado, im }) => {
        const esSerial = im >= SERIAL_MIN && im <= SERIAL_MAX;
        const causa = esFechaDeSuPropiaFila(c, im, 'carga.importe')
            ? 'el importe es IDENTICO a una celda de fecha de su propia fila: celda mal cargada en la planilla'
            : esSerial ? 'el importe cae en el rango de seriales de fecha de Excel' : 'diferencia sin causa identificada';
        return `      ${c.interno} ${c.fecha}: ${c.litros} L x ${c.precio_unitario} = ${esperado.toFixed(2)} pero importe = ${im}\n` +
               `        causa probable: ${causa}`;
    }).join('\n');
    fallar('moneda', `${noCierran.length} carga(s) donde importe != litros x precio unitario (>2%):\n${detalle}`);
} else {
    cerrados && console.log(`  moneda: las ${cerrados} cargas con precio cierran contra litros x precio`);
}

// 4b. Horas: total = ralentí + movimiento (la suma la hace aggregateHours en el parser).
const horasMal = gps.filter(r => {
    const h = r.horas;
    if (!h || typeof h !== 'object') return false;
    const suma = (Number(h.ralenti) || 0) + (Number(h.movimiento) || 0);
    const total = Number(h.total) || 0;
    return Math.abs(suma - total) > 0.05;
});
chequear(horasMal.length === 0, 'horas',
    `${horasMal.length} reporte(s) de GPS donde total != ralenti + movimiento — ej: ${JSON.stringify(horasMal[0]?.horas)}`);

// 4c. Horas vs calendario: un reporte mensual no puede declarar más horas que las del rango.
const horasImposibles = gps.filter(r => {
    const h = r.horas; if (!h || typeof h !== 'object') return false;
    if (!r.fecha || !r.fecha_hasta) return false;
    const dias = (new Date(r.fecha_hasta) - new Date(r.fecha)) / 86400000 + 1;
    return Number(h.total) > dias * 24 + 0.5;
});
chequear(horasImposibles.length === 0, 'horas',
    `${horasImposibles.length} reporte(s) con más horas que las del rango declarado — ej: ${horasImposibles[0]?.interno} ${horasImposibles[0]?.fecha}..${horasImposibles[0]?.fecha_hasta} = ${horasImposibles[0]?.horas?.total} h`);

// 4d. La señal de "fracción de día sin convertir": si las horas fueran seriales de Excel, el
// máximo mensual sería <= 31 en vez de acercarse a 744.
const totales = gps.map(r => Number(r.horas?.total) || 0).filter(n => n > 0);
if (totales.length) {
    const maxH = Math.max(...totales);
    chequeos++;
    if (maxH <= 31) fallar('horas', `el máximo de horas mensuales es ${maxH.toFixed(2)} (<= 31): parecen fracciones de día de Excel SIN convertir a horas`);
    else console.log(`  horas: máximo mensual ${maxH.toFixed(1)} h — están en horas reales, no en fracción de día`);
}

// 4e. Velocidad implícita: km ÷ horas de movimiento. Fuera de rango físico = unidades mezcladas.
const velocidades = [];
for (const r of gps) {
    const km = Number(r.distancia) || 0;
    const hm = Number(r.horas?.movimiento) || 0;
    if (km > 10 && hm > 1) velocidades.push({ v: km / hm, r });
}
if (velocidades.length) {
    const absurdas = velocidades.filter(x => x.v > 120);
    chequear(absurdas.length === 0, 'cruce km/horas',
        `${absurdas.length} equipo-mes con velocidad media > 120 km/h — km y horas podrían no estar en la misma unidad. ` +
        `ej: ${absurdas[0]?.r.interno} ${absurdas[0]?.r.fecha}: ${absurdas[0]?.r.distancia} km / ${absurdas[0]?.r.horas.movimiento} h = ${absurdas[0]?.v.toFixed(1)} km/h`);
    const orden = velocidades.map(x => x.v).sort((a, b) => a - b);
    console.log(`  cruce km/horas: velocidad media p50=${orden[Math.floor(orden.length / 2)].toFixed(1)} km/h · max=${orden.at(-1).toFixed(1)} km/h`);
}

// ---------------------------------------------------------------- 5. claves de cruce
// La clave normalizada es el único puente entre las cuatro planillas: si una fuente escribe el
// mismo equipo con otra clave, ese equipo pierde datos en silencio.
const claveDe = new Map();   // clave normalizada -> grafías originales encontradas
for (const r of [...cargas, ...gps, ...entregas]) {
    if (!r.interno_key) continue;
    if (!claveDe.has(r.interno_key)) claveDe.set(r.interno_key, new Set());
    if (r.interno) claveDe.get(r.interno_key).add(r.interno);
}
const claveVacia = [...cargas, ...gps, ...entregas].filter(r => r.interno && !r.interno_key);
chequear(claveVacia.length === 0, 'claves', `${claveVacia.length} registro(s) con interno pero sin interno_key`);

const noNormalizadas = [...claveDe.entries()].filter(([, grafias]) => grafias.size > 1);
if (noNormalizadas.length) {
    console.log(`  claves: ${noNormalizadas.length} equipo(s) escritos de más de una forma y unificados correctamente`);
    noNormalizadas.slice(0, 3).forEach(([k, g]) => console.log(`      ${k} <- ${[...g].join(' , ')}`));
}

// ---------------------------------------------------------------- 6. reporte
console.log(`\nChequeos corridos: ${chequeos}`);

if (avisos.length) {
    console.log(`\n--- AVISOS (${avisos.length}) — no rompen una regla, pero merecen una mirada ---`);
    avisos.forEach(a => console.log('  . ' + a));
}

if (fallos.length) {
    console.log(`\nFALLÓ LA AUDITORÍA DE UNIDADES (${fallos.length}):`);
    fallos.forEach(f => console.log('  - ' + f));
    console.log('\nUn número en la unidad equivocada no lanza ningún error: sigue imprimiendo');
    console.log('una cifra plausible. Por eso esto falla fuerte en vez de avisar.');
    process.exit(1);
}

console.log('\nOK - los formatos, las unidades y los cruces son coherentes entre si.');
