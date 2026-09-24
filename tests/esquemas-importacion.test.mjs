/**
 * Importacion flexible (Fase 7): reconocer de que tipo es una planilla y que columna es cada
 * campo, en vez de importarla en silencio como "otra planilla".
 *
 * Los encabezados de los casos salen de los archivos reales de ARCHIVOS/ y de la trampa que
 * documenta el propio esquema: "CANTIDAD" y "VOLUMEN" quedaron fuera de los sinonimos de
 * litros a proposito, porque una planilla de cubiertas tambien los trae.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    ESQUEMAS, TIPOS_CONOCIDOS, sugerirMapeo, puntuarEsquemas, firmaEncabezados,
    detectarFormatoColumna
} from '../js/parsers/esquemas.js';

const HEADERS_CARGAS = [
    'INTERNO-DOMINIO', 'FECHA', 'LITROS', 'COSTO TOTAL ($)', 'PRECIO UNITARIO',
    'TIPO DE COMBUSTIBLE', 'LUGAR DE CARGA', 'CHOFER', 'CENTRO DE COSTO'
];
const HEADERS_GPS = [
    'Unidad', 'Kilometros recorridos', 'Tiempo en movimiento', 'Tiempo en ralentí', 'Tiempo parado'
];
const HEADERS_EQUIPOS = ['INTERNO', 'DOMINIO', 'TIPO', 'MARCA', 'MODELO', 'AÑO', 'UBICACION'];

// --- puntuarEsquemas: de que tipo es esta planilla ------------------------------------------

test('puntuarEsquemas reconoce la planilla de Cargas por sus encabezados', () => {
    const [mejor] = puntuarEsquemas(HEADERS_CARGAS);
    assert.equal(mejor.tipo, 'CARGAS');
    assert.deepEqual(mejor.faltantes, [], 'no deberia faltar ningun requerido');
});

test('puntuarEsquemas reconoce el Resumen de Flota', () => {
    const [mejor] = puntuarEsquemas(HEADERS_GPS);
    assert.equal(mejor.tipo, 'GPS');
    assert.deepEqual(mejor.faltantes, []);
});

test('puntuarEsquemas reconoce el maestro de Equipos', () => {
    const [mejor] = puntuarEsquemas(HEADERS_EQUIPOS);
    assert.equal(mejor.tipo, 'EQUIPOS');
    assert.deepEqual(mejor.faltantes, []);
});

test('puntuarEsquemas devuelve todos los tipos, ordenados de mejor a peor', () => {
    const r = puntuarEsquemas(HEADERS_CARGAS);
    assert.equal(r.length, TIPOS_CONOCIDOS.length, 'un tipo con faltantes igual aparece');
    for (let i = 1; i < r.length; i++) {
        assert.ok(r[i - 1].puntaje >= r[i].puntaje, 'el orden deberia ser descendente');
    }
});

test('una planilla ajena no se hace pasar por Cargas', () => {
    // La trampa: "CANTIDAD" quedo fuera de los sinonimos de litros justamente por esto.
    const cubiertas = ['MARCA CUBIERTA', 'MEDIDA', 'CANTIDAD', 'VOLUMEN', 'OBSERVACIONES'];
    const [mejor] = puntuarEsquemas(cubiertas);
    assert.ok(mejor.puntaje < 0.5, `puntaje ${mejor.puntaje} deberia ser flojo`);
    assert.ok(mejor.faltantes.length > 0, 'y deberia declarar que le falta lo requerido');
});

test('la identidad se cumple con interno O con dominio: hay planillas con solo la patente', () => {
    const soloPatente = ['PATENTE', 'FECHA', 'LITROS', 'IMPORTE'];
    const cargas = puntuarEsquemas(soloPatente).find(r => r.tipo === 'CARGAS');
    assert.equal(cargas.faltantes.includes('Interno (o interno + dominio)'), false,
        `faltantes: ${cargas.faltantes.join(', ')}`);
});

test('puntuarEsquemas sobre una lista vacia no rompe ni elige nada', () => {
    const r = puntuarEsquemas([]);
    assert.equal(r.length, TIPOS_CONOCIDOS.length);
    assert.equal(r[0].puntaje, 0);
});

// --- sugerirMapeo: que columna es cada campo -------------------------------------------------

test('sugerirMapeo asigna cada campo a su columna', () => {
    const m = sugerirMapeo('CARGAS', HEADERS_CARGAS);
    assert.equal(m.fecha, 'FECHA');
    assert.equal(m.litros, 'LITROS');
    assert.equal(m.interno, 'INTERNO-DOMINIO');
    assert.equal(m.chofer, 'CHOFER');
});

test('un encabezado se usa una sola vez: "TIPO DE COMBUSTIBLE" no queda tambien como tipo', () => {
    const m = sugerirMapeo('CARGAS', HEADERS_CARGAS);
    assert.equal(m.combustible, 'TIPO DE COMBUSTIBLE');
    const usados = Object.values(m);
    assert.equal(usados.length, new Set(usados).size, `hay un header repetido: ${usados.join(', ')}`);
});

test('sugerirMapeo distingue las tres columnas de tiempo del GPS', () => {
    const m = sugerirMapeo('GPS', HEADERS_GPS);
    assert.equal(m.movimiento, 'Tiempo en movimiento');
    assert.equal(m.ralenti, 'Tiempo en ralentí');
    assert.equal(m.parado, 'Tiempo parado');
    assert.equal(m.km, 'Kilometros recorridos');
});

test('sugerirMapeo devuelve un objeto vacio ante un tipo que no existe', () => {
    assert.deepEqual(sugerirMapeo('NO_EXISTE', HEADERS_CARGAS), {});
});

test('sugerirMapeo sin encabezados no inventa un mapeo', () => {
    assert.deepEqual(sugerirMapeo('CARGAS', []), {});
});

// --- firmaEncabezados --------------------------------------------------------------------------

test('dos exports del mismo reporte firman igual aunque cambie mayusculas o espacios', () => {
    // El nombre del archivo y el capitalizado cambian entre meses; el formato no.
    assert.equal(
        firmaEncabezados(['Unidad', 'Kilometros recorridos', 'Tiempo en movimiento']),
        firmaEncabezados(['UNIDAD', '  Kilometros  Recorridos ', 'tiempo_en_movimiento'])
    );
});

test('una columna repetida no cambia la firma: lo que importa es el conjunto', () => {
    assert.equal(
        firmaEncabezados(['INTERNO', 'FECHA']),
        firmaEncabezados(['INTERNO', 'FECHA', 'INTERNO'])
    );
});

test('la firma no depende del orden de las columnas', () => {
    assert.equal(firmaEncabezados(HEADERS_GPS), firmaEncabezados([...HEADERS_GPS].reverse()));
});

test('agregar o renombrar una columna cambia la firma, y el mapeo recordado deja de aplicar', () => {
    assert.notEqual(firmaEncabezados(HEADERS_GPS), firmaEncabezados([...HEADERS_GPS, 'NUEVA']));
    assert.notEqual(
        firmaEncabezados(['INTERNO', 'FECHA']),
        firmaEncabezados(['INTERNO', 'FECHA DE CARGA'])
    );
});

test('dos formatos distintos no colisionan en la misma firma', () => {
    // Lo unico que importa del formato interno: que dos planillas distintas no se confundan y
    // una herede el mapeo confirmado de la otra. (Afirmar que empieza con "firma:" o que es
    // igual a si misma no prueba nada: una funcion pura determinista no puede fallar eso.)
    const firmas = new Set([HEADERS_CARGAS, HEADERS_GPS, HEADERS_EQUIPOS].map(firmaEncabezados));
    assert.equal(firmas.size, 3, `hubo colision: ${[...firmas]}`);
});

// --- detectarFormatoColumna ----------------------------------------------------------------------

test('detectarFormatoColumna reconoce una columna de patentes como identidad', () => {
    const r = detectarFormatoColumna(['JNU923', 'AF809IC', 'OXZ911', 'AD031FG'], 'DOMINIO');
    assert.equal(r.formato, 'identidad');
});

test('detectarFormatoColumna reconoce "interno + dominio juntos"', () => {
    const r = detectarFormatoColumna(['TR21 AD291BF', 'CM43 JNU923', 'BM09 HHA905'], 'INTERNO-DOMINIO');
    assert.equal(r.formato, 'identidad');
    assert.equal(r.detalle, 'interno + dominio juntos');
});

test('un codigo suelto solo es identidad si el encabezado lo sugiere', () => {
    // "F350" o "X1" sin contexto podrian ser un MODELO.
    const conHeader = detectarFormatoColumna(['TR20', 'TR21', 'CM43'], 'INTERNO');
    assert.equal(conHeader.formato, 'identidad');

    const sinHeader = detectarFormatoColumna(['F350', 'X1', 'S10'], 'MODELO');
    assert.notEqual(sinHeader.formato, 'identidad');
});

test('detectarFormatoColumna distingue las dos escrituras de fecha', () => {
    assert.deepEqual(
        detectarFormatoColumna(['15/03/2026', '01/04/2026', '30/04/2026'], 'FECHA'),
        { formato: 'fecha', detalle: 'dd/mm/aaaa' }
    );
    assert.deepEqual(
        detectarFormatoColumna(['2026-03-15', '2026-04-01', '2026-04-30'], 'FECHA'),
        { formato: 'fecha', detalle: 'aaaa-mm-dd' }
    );
});

test('detectarFormatoColumna reconoce una columna de horas en texto', () => {
    const r = detectarFormatoColumna(['10:30:00', '08:15:00', '12:00:00'], 'TIEMPO EN MOVIMIENTO');
    assert.equal(r.formato, 'horas');
});

test('detectarFormatoColumna marca vacia la columna sin ningun valor', () => {
    assert.deepEqual(
        detectarFormatoColumna(['', null, undefined], 'OBSERVACIONES'),
        { formato: 'vacia', detalle: 'sin valores' }
    );
    assert.equal(detectarFormatoColumna([], 'X').formato, 'vacia');
});

test('detectarFormatoColumna reconoce una columna numerica', () => {
    assert.equal(detectarFormatoColumna([197, 250.5, 300, 412], 'LITROS').formato, 'numero');
});

test('detectarFormatoColumna cae a texto cuando no hay una forma dominante', () => {
    const r = detectarFormatoColumna(['Perez', 'Gomez', 'Rodriguez', 'Lopez'], 'CHOFER');
    assert.equal(r.formato, 'texto');
});

// --- coherencia del esquema en si ------------------------------------------------------------------

test('todos los tipos conocidos tienen etiqueta y al menos un campo requerido', () => {
    for (const tipo of TIPOS_CONOCIDOS) {
        const e = ESQUEMAS[tipo];
        assert.ok(e.etiqueta, `${tipo} sin etiqueta`);
        const requeridos = Object.values(e.campos).filter(c => c.requerido);
        assert.ok(requeridos.length > 0, `${tipo} sin ningun campo requerido`);
    }
});

test('todos los tipos resuelven identidad por interno o por dominio', () => {
    for (const tipo of TIPOS_CONOCIDOS) {
        const identidad = Object.values(ESQUEMAS[tipo].campos).filter(c => c.identidad);
        assert.ok(identidad.length >= 1, `${tipo} no tiene ningun campo de identidad`);
    }
});
