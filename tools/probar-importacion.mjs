/**
 * Cuarto arnés — Fase 7: importación flexible y planilla principal.
 *
 * A diferencia de `verificar` y `auditar`, NO usa las planillas reales: arma planillas
 * inventadas en memoria (con SheetJS) y corre el pipeline real de la app (inspeccionar →
 * importar con o sin decisión → IndexedDB en memoria → analizarFlota → generarDiagnostico).
 * Por eso corre en CI, en un repo público, sin exponer ningún dato de la flota.
 *
 * Qué garantiza:
 *  1. Un archivo con columnas renombradas ("HP" por "POTENCIA", "N° Interno") NO se importa
 *     en silencio: queda para revisar, con el tipo y las columnas bien sugeridos.
 *  2. Confirmado el mapeo, se importa bien; y ese formato queda recordado por su firma — el
 *     próximo archivo igual entra solo. Si cambian las columnas, se vuelve a pedir revisión.
 *  3. Los formatos conocidos se siguen reconociendo exacto, como siempre.
 *  4. Manda la planilla principal: solo se analizan los "interno dominio" que figuran en ella;
 *     el resto del maestro queda en `fuera_principal` con su GPS, y los KPI cierran.
 *  5. Una planilla principal que no es combustible (cubiertas) define su propio universo.
 *  6. Un archivo que repite cargas ya cargadas (caso GRIS) se detecta y, guardado aparte, no
 *     suma litros.
 *  7. Un interno con dos patentes distintas genera el hallazgo de identidad inconsistente.
 *  8. El formato de cada columna se reconoce (fecha, número con coma, horas, identidad).
 *
 * Uso: node tools/probar-importacion.mjs [--verboso]    · Sale con código 1 si algo falla.
 */
import 'fake-indexeddb/auto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.XLSX = require('../xlsx.full.min.js');
globalThis.FileReader = class {
    readAsArrayBuffer(file) {
        const b = file.__buffer;
        queueMicrotask(() => this.onload && this.onload({ target: { result: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) } }));
    }
};

const { parseXLSX, inspeccionarArchivo, superposicionConCargas } = await import('../js/parsers/xlsx-parser.js');
const db = await import('../js/data/database.js');
const { analizarFlota } = await import('../js/data/analyzer.js');
const { generarDiagnostico } = await import('../js/data/diagnostico.js');
const { detectarFormatoColumna } = await import('../js/parsers/esquemas.js');

const VERBOSO = process.argv.includes('--verboso');
const fallas = [];
let chequeos = 0;
function check(grupo, nombre, ok, detalle = '') {
    chequeos++;
    if (!ok) fallas.push(`${grupo} · ${nombre}${detalle ? ` — ${detalle}` : ''}`);
    else if (VERBOSO) console.log(`  ok · ${grupo} · ${nombre}`);
}

/** Planilla en memoria: filas = array de arrays (la primera puede ser título, no encabezado). */
function archivo(nombre, filas) {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filas), 'Hoja1');
    return { name: nombre, __buffer: Buffer.from(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })) };
}

await db.initDB();
const analizar = async (principal = 'carga') => {
    const [equipos, rawRecords, estimados] = await Promise.all([db.getAllEquipos(), db.getAllRawRecords(), db.getAllEstimados()]);
    return { a: analizarFlota({ equipos, rawRecords, estimados, filtro: {}, principal }), rawRecords };
};

// ---------------------------------------------------------------- 1-3. detección y memoria
const equiposRenombrado = [
    ['N° Interno', 'Patente', 'Tipo', 'Marca', 'Modelo', 'HP'],
    ['ZZ01', 'AA000AA', 'CAMION', 'PRUEBA', 'X1', '300'],
    ['ZZ02', 'AA000AB', 'CAMIONETA', 'PRUEBA', 'X2', '150'],
    ['ZZ03', 'AA000AC', 'TRACTOR', 'PRUEBA', 'X3', '420'],
    ['ZZ04', 'AA000AD', 'CAMION', 'PRUEBA', 'X4', '280']
];
const f1 = archivo('padron nuevo.xlsx', equiposRenombrado);
const i1 = await inspeccionarArchivo(f1);
check('deteccion', 'columnas renombradas → para revisar, no se importa en silencio', i1.estado === 'revisar', `estado ${i1.estado}`);
check('deteccion', 'sugiere Equipos', i1.sugerencia === 'EQUIPOS', `sugerencia ${i1.sugerencia}`);
const m1 = i1.puntajes.find(p => p.tipo === 'EQUIPOS').mapeo;
check('deteccion', 'HP → potencia', m1.potencia === 'HP', JSON.stringify(m1));
check('deteccion', 'N° Interno → interno', /INTERNO/.test(m1.interno || ''), JSON.stringify(m1));
check('deteccion', 'Patente → dominio', m1.dominio === 'PATENTE', JSON.stringify(m1));

await parseXLSX(f1, { tipo: 'EQUIPOS', mapeo: m1, headerRowIdx: i1.headerRowIdx, recordar: true });
let eqs = await db.getAllEquipos();
check('importacion', 'con el mapeo confirmado entran los 4 equipos', eqs.length === 4, `${eqs.length}`);
check('importacion', 'la potencia se leyó desde "HP"', String(eqs.find(e => e.interno === 'ZZ03')?.potencia || '').includes('420'), JSON.stringify(eqs.find(e => e.interno === 'ZZ03')));

const f1b = archivo('padron otro mes.xlsx', equiposRenombrado.map((r, i) => i === 0 ? r : [r[0].replace('ZZ', 'YY'), ...r.slice(1)]));
const i1b = await inspeccionarArchivo(f1b);
check('memoria', 'mismo formato, otro archivo → recordado', i1b.estado === 'recordado' && i1b.tipo === 'EQUIPOS', `estado ${i1b.estado} tipo ${i1b.tipo}`);
await parseXLSX(f1b); // sin decisión: tiene que aplicar el mapeo recordado solo
eqs = await db.getAllEquipos();
check('memoria', 'se importó solo como Equipos', eqs.some(e => e.interno === 'YY01'), eqs.map(e => e.interno).join(','));
for (const e of eqs.filter(e => e.interno.startsWith('YY'))) await db.deleteEquipo(e.interno);

const f1c = archivo('padron con columna nueva.xlsx', equiposRenombrado.map((r, i) => [...r, i === 0 ? 'Sede' : 'MENDOZA']));
check('memoria', 'si cambian las columnas → vuelve a pedir revisión', (await inspeccionarArchivo(f1c)).estado === 'revisar');

const f1d = archivo('Equipos exacto.xlsx', [['INTERNO', 'DOMINIO', 'TIPO', 'MARCA', 'MODELO', 'POTENCIA'], ['WW01', 'AB123CD', 'CAMION', 'X', 'Y', '200']]);
check('deteccion', 'formato conocido exacto → reconocido directo', (await inspeccionarArchivo(f1d)).estado === 'reconocido');

// ---------------------------------------------------------------- 4. universo = planilla principal
const cargas = archivo('Cargas prueba.xlsx', [
    ['FECHA', 'LUGAR DE CARGA', 'INTERNO-DOMINIO', 'LITROS', 'TIPO DE COMBUSTIBLE', 'COSTO TOTAL ($)'],
    ['05/01/2026', 'BASE', 'ZZ01 AA000AA', 100, 'GASOIL', 100000],
    ['12/01/2026', 'BASE', 'ZZ-01 AA000AA', 50, 'GASOIL', 50000],
    ['07/01/2026', 'BASE', 'ZZ02 AA000AB', 80, 'GASOIL', 80000],
    ['20/01/2026', 'BASE', 'ZZ02 AA000XX', 20, 'GASOIL', 20000]   // misma unidad, patente mal tipeada
]);
check('deteccion', 'Cargas en formato oficial → reconocido', (await inspeccionarArchivo(cargas)).estado === 'reconocido');
await parseXLSX(cargas);
const gps = archivo('Resumen de Flota - enero.xlsx', [
    ['Desde:', '01/01/2026'], ['Hasta:', '31/01/2026'], [],
    ['UNIDAD', 'KILOMETROS RECORRIDOS', 'TIEMPO EN RALENTI', 'TIEMPO EN MOVIMIENTO'],
    ['ZZ01', 1000, 0.5, 2], ['ZZ02', 500, 0.25, 1], ['ZZ03', 7000, 1, 10]   // ZZ03: GPS sin ninguna carga
]);
await parseXLSX(gps);

let { a, rawRecords } = await analizar('carga');
const internos = a.filas.map(f => f.equipo.interno).sort().join(',');
check('universo', 'solo se analizan los que figuran en Cargas (ZZ01, ZZ02)', internos === 'ZZ01,ZZ02', internos);
const fuera = a.totales.universo.fuera_principal;
check('universo', 'ZZ03 y ZZ04 quedan listados fuera, no desaparecen', ['ZZ03', 'ZZ04'].every(i => fuera.some(f => f.interno === i)), fuera.map(f => f.interno).join(','));
check('universo', 'ZZ03 conserva su GPS en la lista de fuera', Math.round(fuera.find(f => f.interno === 'ZZ03')?.km || 0) === 7000);
check('universo', 'el KPI de km no incluye al equipo fuera del universo', Math.round(a.totales.total_km) === 1500, `${a.totales.total_km}`);
check('universo', 'litros intactos (150 + 100)', Math.round(a.totales.total_litros) === 250, `${a.totales.total_litros}`);
const sumaKm = a.filas.reduce((s, f) => s + f.metrics.total_km, 0) + a.totales.sin_asignar.km;
check('universo', 'KPI de km = Σ tarjetas + sin asignar', Math.abs(sumaKm - a.totales.total_km) < 0.01, `${sumaKm} vs ${a.totales.total_km}`);
check('identidad', '"ZZ-01 AA000AA" y "ZZ01 AA000AA" son el mismo equipo', a.filas.find(f => f.equipo.interno === 'ZZ01')?.metrics.cantidad_cargas === 2);
check('identidad', '"ZZ-01 AA000AA" conserva la patente (antes la regla del guion la tiraba)',
    rawRecords.filter(r => r.type === 'carga' && r.interno === 'ZZ01').every(r => r.dominio === 'AA000AA'),
    rawRecords.filter(r => r.type === 'carga' && r.interno === 'ZZ01').map(r => `${r.interno}/${r.dominio || '(sin dominio)'}`).join(', '));
check('identidad', 'se muestra como "INTERNO DOMINIO"', a.filas.find(f => f.equipo.interno === 'ZZ01')?.identidad === 'ZZ01 AA000AA', a.filas.find(f => f.equipo.interno === 'ZZ01')?.identidad);

const hallazgos = generarDiagnostico(a.filas, a.totales, rawRecords, [], [], [], {});
// Una correccion automatica deshecha no se lista mas como "aplicada sola": esta revertida.
const conAcciones = generarDiagnostico(a.filas, a.totales, rawRecords, [], [], [], { accionesRecientes: [
    { id: 1, tipo: 'corregido_tipeo', codigo: 'GR01', motivo: 'x', detalle: '', fecha: new Date().toISOString(), revisado: false, deshecha: true },
    { id: 2, tipo: 'patente_unificada', codigo: 'MX59', motivo: 'y', detalle: '', fecha: new Date().toISOString(), revisado: false }
] }).find(h => h.id === 'acciones_automaticas');
check('diagnostico', 'una accion automatica deshecha no se lista, una vigente si',
    !!conAcciones && conAcciones.equipos.length === 1 && conAcciones.equipos[0].interno === 'MX59', JSON.stringify(conAcciones?.equipos?.map(e => e.interno)));
const hFuera = hallazgos.find(h => h.id === 'fuera_principal');
check('diagnostico', 'un equipo sin cargas NO genera hallazgo: simplemente no se analiza', !hFuera);
check('diagnostico', 'igual queda registrado en universo.fuera_principal, con su GPS primero', fuera[0]?.interno === 'ZZ03' || fuera.some(f => f.interno === 'ZZ03'), fuera.map(f => f.interno).join(','));
const hId = hallazgos.find(h => h.id === 'identidad_inconsistente');
check('diagnostico', 'interno con dos patentes → identidad inconsistente', !!hId && hId.equipos.some(e => /AA000AB/.test(e.texto) && /AA000XX/.test(e.texto)), JSON.stringify(hId?.equipos));

// ---------------------------------------------------------------- 5. principal genérica (cubiertas)
const cubiertas = archivo('Cubiertas 2026.xlsx', [
    ['Interno Dominio', 'Fecha', 'Cantidad', 'Costo'],
    ['ZZ03 AA000AC', '10/01/2026', 2, 400000],
    ['ZZ04 AA000AD', '15/01/2026', 4, 800000]
]);
const iCub = await inspeccionarArchivo(cubiertas);
check('generica', 'una planilla de otro bien → para revisar', iCub.estado === 'revisar', iCub.estado);
check('generica', 'cubiertas NO se sugieren como Cargas de Combustible ("Cantidad" no es litros)', iCub.sugerencia !== 'CARGAS', `sugerencia ${iCub.sugerencia}`);
await parseXLSX(cubiertas, { tipo: null, etiqueta: 'Cubiertas', mapeo: { interno: 'INTERNO DOMINIO', fecha: 'FECHA' }, headerRowIdx: iCub.headerRowIdx, recordar: false });
const tipoCub = (await db.getAllRawRecords()).find(r => r.type_label === 'Cubiertas')?.type;
check('generica', 'se importó como planilla "Cubiertas"', !!tipoCub);
({ a } = await analizar(tipoCub));
const intCub = a.filas.map(f => f.equipo.interno).sort().join(',');
check('generica', 'con Cubiertas como principal, el universo son ZZ03 y ZZ04', intCub === 'ZZ03,ZZ04', intCub);
check('generica', 'ZZ01 y ZZ02 quedan fuera', ['ZZ01', 'ZZ02'].every(i => a.totales.universo.fuera_principal.some(f => f.interno === i)));
check('generica', 'el número de fila de Excel no se cuenta como dato numérico',
    a.filas.every(f => f.otros.every(r => !Object.keys(r.numericos || {}).some(k => /fila/i.test(k)))));
check('generica', 'las columnas numéricas se sumaron por equipo', a.filas.find(f => f.equipo.interno === 'ZZ04')?.otros.some(r => r.numericos?.cantidad === 4), JSON.stringify(a.filas.find(f => f.equipo.interno === 'ZZ04')?.otros?.[0]?.numericos));

// ---------------------------------------------------------------- 6. duplicado de cargas (caso GRIS)
const gris = archivo('Reporte estacion.xlsx', [
    ['Patente', 'Fecha', 'Lts', 'Combustible'],
    ['AA000AA', '05/01/2026', 100, 'GASOIL'],
    ['AA000AA', '12/01/2026', 50, 'GASOIL'],
    ['AA000AB', '07/01/2026', 80, 'GASOIL']
]);
const iGris = await inspeccionarArchivo(gris);
check('duplicados', 'reporte de estación → para revisar', iGris.estado === 'revisar', iGris.estado);
const iGris2 = await inspeccionarArchivo(archivo('Reporte con litros.xlsx', [['Patente', 'Fecha', 'Litros', 'Tipo de combustible'], ['AA000AA', '05/01/2026', 100, 'GASOIL']]));
check('duplicados', 'con solo patente (sin interno) igual se reconoce como Cargas', iGris2.sugerencia === 'CARGAS', `sugerencia ${iGris2.sugerencia}`);
const mGris = { dominio: 'PATENTE', fecha: 'FECHA', litros: 'LTS', combustible: 'COMBUSTIBLE' };
const sup = await superposicionConCargas(gris, iGris.headerRowIdx, mGris);
check('duplicados', 'detecta que las 3 cargas ya existen', sup.total === 3 && sup.coinciden === 3, JSON.stringify(sup));
await parseXLSX(gris, { tipo: 'CARGAS', modo: 'aparte', etiqueta: 'Reporte estacion (aparte)', mapeo: mGris, headerRowIdx: iGris.headerRowIdx });
({ a } = await analizar('carga'));
check('duplicados', 'guardado aparte no suma litros', Math.round(a.totales.total_litros) === 250, `${a.totales.total_litros}`);
const aparte = (await db.getAllRawRecords()).filter(r => r._posible_duplicado_cargas);
check('duplicados', 'queda marcado como posible duplicado de Cargas', aparte.length === 3, `${aparte.length}`);

// Formato recordado como "Cargas, incorporar": un archivo nuevo de ese formato que repite
// cargas NO se suma a ciegas (reproducido en el navegador el 18/09: 240 L pasaban a 420 L).
const nuevaEstacion = archivo('Estacion mes 1.xlsx', [['Movil', 'Dia', 'Litros', 'Tipo de combustible'], ['ZZ01', '28/01/2026', 30, 'GASOIL']]);
const iEst = await inspeccionarArchivo(nuevaEstacion);
await parseXLSX(nuevaEstacion, { tipo: 'CARGAS', mapeo: { interno: 'MOVIL', fecha: 'DIA', litros: 'LITROS', combustible: 'TIPO DE COMBUSTIBLE' }, headerRowIdx: iEst.headerRowIdx, recordar: true });
({ a } = await analizar('carga'));
check('duplicados', 'una carga nueva de un formato confirmado se incorpora (250 + 30)', Math.round(a.totales.total_litros) === 280, `${a.totales.total_litros}`);
const estacionRepetida = archivo('Estacion mes 2.xlsx', [['Movil', 'Dia', 'Litros', 'Tipo de combustible'], ['ZZ01', '05/01/2026', 100, 'GASOIL'], ['ZZ02', '07/01/2026', 80, 'GASOIL']]);
check('duplicados', 'el mismo formato se reconoce como recordado', (await inspeccionarArchivo(estacionRepetida)).estado === 'recordado');
await parseXLSX(estacionRepetida); // sin decisión explícita: entra por la memoria
({ a } = await analizar('carga'));
check('duplicados', 'recordado pero repite cargas existentes → se guarda aparte, los litros no cambian', Math.round(a.totales.total_litros) === 280, `${a.totales.total_litros}`);

// ---------------------------------------------------------------- 7. sin planilla principal cargada
await db.clearMovimientos();
({ a } = await analizar('carga'));
check('universo', 'sin Cargas cargadas no se restringe (el panel avisa "falta procesar")', a.totales.universo.restringido === false && a.filas.length === 4, `${a.totales.universo.restringido} ${a.filas.length}`);

// ---------------------------------------------------------------- 8. formato de columnas
const fmt = (vals, h) => detectarFormatoColumna(vals, h).formato;
check('formatos', 'fechas dd/mm/aaaa', fmt(['05/01/2026', '12/01/2026'], 'FECHA') === 'fecha');
check('formatos', 'fecha como número de serie de Excel', fmt([46027, 46034], 'FECHA') === 'fecha');
check('formatos', 'números con coma decimal', fmt(['1.234,50', '98,25'], 'LITROS') === 'numero');
check('formatos', 'horas como fracción de día', fmt([0.5, 0.25], 'TIEMPO EN RALENTI') === 'horas');
check('formatos', 'interno + dominio juntos', fmt(['TR21 AD291BF', 'BM07 JNU923'], 'INTERNO-DOMINIO') === 'identidad');
check('formatos', 'un modelo tipo "F350" no se confunde con un código de equipo', fmt(['F350', 'X1', 'G440'], 'MODELO') !== 'identidad');

console.log('\n=== IMPORTACION FLEXIBLE Y PLANILLA PRINCIPAL (Fase 7) ===\n');
console.log(`Chequeos corridos: ${chequeos}\n`);
if (fallas.length) {
    console.error('FALLAS:');
    fallas.forEach(f => console.error('  - ' + f));
    process.exit(1);
}
console.log('OK - deteccion, mapeo recordado, universo de la planilla principal y duplicados coherentes.');
