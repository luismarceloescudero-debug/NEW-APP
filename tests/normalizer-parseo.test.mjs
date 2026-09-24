/**
 * Parseo de celdas de Excel a numeros, fechas y horas.
 *
 * Cada caso de acá sale de un error que ya ocurrió sobre los archivos reales y quedó
 * documentado en el codigo o en CLAUDE.md: "9.5" leido como 95, "07:30" leido como 7,
 * "3 days, 10:53:03" leido como 10:53, la fecha GPS "1/1/2026, 0:00" guardada como
 * "2026,-01-01". Son fallas silenciosas: no tiran error, imprimen un numero plausible.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    parseNumber, parseDate, parseHoraDeFecha, parseDuration, parseExcelHours,
    aggregateHours, parseConsumoEstimado, partesFecha, formatFechaAR, normalizeString
} from '../js/data/normalizer.js';

// --- parseNumber: la ambiguedad del punto -----------------------------------------------

test('parseNumber respeta el punto decimal de un export en locale ingles', () => {
    // El bug: borrar el punto siempre convertia 9.5 en 95 — un factor diez en litros o precio.
    assert.equal(parseNumber('9.5'), 9.5);
    assert.equal(parseNumber('0.75'), 0.75);
    assert.equal(parseNumber('1234.56'), 1234.56);
});

test('parseNumber trata el punto como separador de miles cuando la forma es de miles', () => {
    assert.equal(parseNumber('1.234'), 1234);
    assert.equal(parseNumber('12.345.678'), 12345678);
});

test('parseNumber deja mandar a la coma como decimal en formato hispano puro', () => {
    assert.equal(parseNumber('1.234,56'), 1234.56);
    assert.equal(parseNumber('2.914,00'), 2914);
    assert.equal(parseNumber('0,75'), 0.75);
});

test('parseNumber quita simbolos de moneda y espacios', () => {
    assert.equal(parseNumber('$ 2.400'), 2400);
    assert.equal(parseNumber('$1.375.494,50'), 1375494.5);
    assert.equal(parseNumber(' 197 '), 197);
});

test('parseNumber devuelve 0 ante vacio o texto, nunca NaN', () => {
    for (const v of ['', null, undefined, 'N/A', '---', 'sin dato']) {
        const n = parseNumber(v);
        assert.equal(Number.isNaN(n), false, `${JSON.stringify(v)} no debe dar NaN`);
        assert.equal(n, 0);
    }
});

test('parseNumber pasa de largo un number, sin re-interpretarlo', () => {
    assert.equal(parseNumber(1234.56), 1234.56);
    assert.equal(parseNumber(0), 0);
    assert.equal(parseNumber(-15.5), -15.5);
});

test('parseNumber conserva el signo negativo', () => {
    assert.equal(parseNumber('-1.234,5'), -1234.5);
    assert.equal(parseNumber('-9.5'), -9.5);
});

// --- parseDate ---------------------------------------------------------------------------

test('parseDate convierte el serial de Excel a ISO', () => {
    assert.equal(parseDate(45000), '2023-03-15');
});

test('parseDate lee DD/MM/YYYY, que es como escribe la planilla', () => {
    assert.equal(parseDate('15/03/2026'), '2026-03-15');
    assert.equal(parseDate('1/1/2026'), '2026-01-01');
});

test('parseDate corta por coma: la fecha del reporte GPS trae "1/1/2026, 0:00"', () => {
    // El bug: cortar solo por espacio dejaba la coma pegada y producia "2026,-01-01",
    // que despues no comparaba contra ninguna fecha de Cargas.
    assert.equal(parseDate('1/1/2026, 0:00'), '2026-01-01');
    assert.equal(parseDate('31/12/2026, 24:00'), '2026-12-31');
});

test('parseDate acepta ISO tal como viene', () => {
    assert.equal(parseDate('2026-03-15'), '2026-03-15');
});

test('parseDate expande el anio de dos digitos al siglo actual', () => {
    assert.equal(parseDate('15/03/26'), '2026-03-15');
});

test('parseDate devuelve string vacio ante lo invalido, nunca una fecha inventada', () => {
    for (const v of ['', null, undefined, 'sin fecha', 0]) {
        assert.equal(parseDate(v), '');
    }
});

// --- parseHoraDeFecha --------------------------------------------------------------------

test('parseHoraDeFecha extrae la hora de la fraccion del serial', () => {
    assert.equal(parseHoraDeFecha(46263.5), '12:00');
    assert.equal(parseHoraDeFecha(46263.25), '06:00');
    assert.equal(parseHoraDeFecha(46263.75), '18:00');
});

test('parseHoraDeFecha no inventa hora cuando la fecha viene sin fraccion', () => {
    assert.equal(parseHoraDeFecha(46263), '');
    assert.equal(parseHoraDeFecha(46263.0001), '', 'menos de ~26 segundos no es una hora cargada');
});

test('parseHoraDeFecha ignora lo que no sea un serial numerico', () => {
    for (const v of ['12:30', '', null, undefined, NaN, Infinity]) {
        assert.equal(parseHoraDeFecha(v), '');
    }
});

// --- parseDuration -----------------------------------------------------------------------

test('parseDuration lee HH:MM:SS a horas decimales', () => {
    assert.equal(parseDuration('10:30:00'), 10.5);
    assert.equal(parseDuration('01:00:00'), 1);
});

test('parseDuration no pierde los minutos de un HH:MM de dos partes', () => {
    // El bug: "07:30" caia al parseNumber final y devolvia 7.
    assert.equal(parseDuration('07:30'), 7.5);
});

test('parseDuration suma los dias enteros del Resumen de Flota multi-mes', () => {
    // El bug: el split por ":" tomaba "3 days, 10" como hora y 82,9 hs reales se leian
    // como 10,9 — el consumo del equipo salia por las nubes.
    assert.equal(parseDuration('3 days, 10:53:03'), 3 * 24 + 10 + 53 / 60 + 3 / 3600);
    assert.equal(parseDuration('1 day, 5:00:00'), 29);
    assert.equal(parseDuration('2 dias 4:15:00'), 2 * 24 + 4.25);
});

test('parseDuration devuelve 0 ante vacio', () => {
    for (const v of ['', null, undefined, 0]) assert.equal(parseDuration(v), 0);
});

// --- parseExcelHours ---------------------------------------------------------------------

test('parseExcelHours convierte la fraccion de dia de Excel a horas', () => {
    // Caso verificado contra archivo real: 1.233 de dia ~ 29.6 hs para 766 km en el mes.
    assert.ok(Math.abs(parseExcelHours(1.2330439814814815) - 29.593) < 0.01);
    assert.equal(parseExcelHours(1), 24);
    assert.equal(parseExcelHours(0.5), 12);
});

test('parseExcelHours sigue aceptando el texto HH:MM:SS de un export futuro', () => {
    assert.equal(parseExcelHours('10:30:00'), 10.5);
    assert.equal(parseExcelHours('3 days, 10:53:03'), 3 * 24 + 10 + 53 / 60 + 3 / 3600);
});

test('parseExcelHours devuelve 0 ante los marcadores de dato ausente', () => {
    for (const v of ['', null, undefined, 'N/A', 'n/a', '---', 'NA']) {
        assert.equal(parseExcelHours(v), 0);
    }
});

// --- aggregateHours ----------------------------------------------------------------------

test('aggregateHours cumple total = ralenti + movimiento + parado', () => {
    // Es una de las igualdades que exige el arnes de unidades.
    const r = aggregateHours({ ralenti: 0.25, movimiento: 0.5, parado: 0.125 });
    assert.equal(r.ralenti, 6);
    assert.equal(r.movimiento, 12);
    assert.equal(r.parado, 3);
    assert.equal(r.total, 21);
    assert.equal(r.total, r.ralenti + r.movimiento + r.parado);
});

test('aggregateHours devuelve ceros ante un valor que no es un objeto', () => {
    for (const v of [null, undefined, 'x', 5]) {
        assert.deepEqual(aggregateHours(v), { ralenti: 0, movimiento: 0, parado: 0, total: 0 });
    }
});

test('aggregateHours completa con cero los componentes ausentes', () => {
    const r = aggregateHours({ movimiento: 0.5 });
    assert.equal(r.ralenti, 0);
    assert.equal(r.parado, 0);
    assert.equal(r.movimiento, 12);
    assert.equal(r.total, 12);
});

// --- parseConsumoEstimado ----------------------------------------------------------------

test('parseConsumoEstimado separa el valor de su unidad', () => {
    // La unidad es el dato que decide si el equipo se mide por hora o por distancia.
    const hora = parseConsumoEstimado(' 3 L/hora ');
    assert.equal(hora.valor, 3);
    assert.equal(hora.unidad, 'L/Hora');

    const km = parseConsumoEstimado(' 9.5 L/100km ');
    assert.equal(km.valor, 9.5);
    assert.equal(km.unidad, 'L/100Km');
});

test('parseConsumoEstimado deja la unidad en null cuando la planilla no la trae', () => {
    assert.equal(parseConsumoEstimado('7').unidad, null);
    assert.equal(parseConsumoEstimado('').unidad, null);
});

// --- partesFecha / formatFechaAR ---------------------------------------------------------

test('partesFecha descompone una ISO sin volver a parsear el string', () => {
    assert.deepEqual(partesFecha('2026-03-15'), { anio: 2026, mes: 3, dia: 15, ym: '2026-03' });
});

test('partesFecha devuelve nulls ante lo que no es una ISO', () => {
    for (const v of ['', null, undefined, 'x', '2026']) {
        assert.deepEqual(partesFecha(v), { anio: null, mes: null, dia: null, ym: null });
    }
});

test('formatFechaAR imprime DD/MM/AAAA', () => {
    assert.equal(formatFechaAR('2026-03-15'), '15/03/2026');
});

// --- normalizeString ---------------------------------------------------------------------

test('normalizeString sube a mayusculas y saca acentos, para poder comparar claves', () => {
    assert.equal(normalizeString('Tunuyán'), 'TUNUYAN');
    assert.equal(normalizeString('  godoy cruz  '), 'GODOY CRUZ');
});

test('normalizeString devuelve string vacio ante nulos, nunca "NULL" ni "undefined"', () => {
    for (const v of [null, undefined, '']) assert.equal(normalizeString(v), '');
});
