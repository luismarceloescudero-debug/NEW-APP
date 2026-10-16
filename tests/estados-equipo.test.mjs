/**
 * Estados de equipo y alta de equipos nuevos: la tarjeta del dashboard cuenta solo lo que saca al
 * equipo de la operacion, un estado abierto no tiene que cortarse, y un alta no puede duplicar un interno.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    CATEGORIAS_SEGUIMIENTO, CATEGORIAS_FUERA_DE_OPERACION, HASTA_ABIERTO,
    contarEstados, rangoDeEstado, datosFaltantes, altasConDatosPendientes, validarAlta,
    fechaDeVenta, cargasPosterioresALaVenta
} from '../js/data/estados-equipo.js';

test('las cinco categorias de la tarjeta existen en la lista de categorias', () => {
    const ids = CATEGORIAS_SEGUIMIENTO.map(c => c.id);
    for (const c of ['fuera_servicio', 'traslado_sj', 'taller_ext', 'taller_int', 'vendido']) assert.ok(ids.includes(c), c);
    assert.equal(new Set(ids).size, ids.length, 'ids repetidos');
    assert.deepEqual(CATEGORIAS_FUERA_DE_OPERACION.filter(c => !ids.includes(c)), []);
});

test('contarEstados cuenta por categoria y deja afuera temporada baja, sin chofer y demas', () => {
    const r = contarEstados([
        { interno: 'A', categoria: 'taller_ext' }, { interno: 'B', categoria: 'taller_ext' },
        { interno: 'C', categoria: 'vendido' }, { interno: 'D', categoria: 'temporada_baja' },
        { interno: 'E', categoria: 'otro' }
    ]);
    assert.equal(r.total, 3);
    assert.equal(r.porCategoria.taller_ext, 2);
    assert.equal(r.porCategoria.vendido, 1);
    assert.equal(r.porCategoria.traslado_sj, 0);
    assert.equal('temporada_baja' in r.porCategoria, false);
});

test('contarEstados sin datos da cero en todas', () => {
    const r = contarEstados([]);
    assert.equal(r.total, 0);
    assert.deepEqual(Object.values(r.porCategoria), [0, 0, 0, 0, 0]);
});

test('un estado sin fecha de fin queda abierto', () => {
    assert.deepEqual(rangoDeEstado({ desde: '2026-05-01', categoria: 'vendido' }),
        [{ desde: '2026-05-01', hasta: HASTA_ABIERTO, categoria: 'vendido' }]);
});

test('un estado con fecha de fin la respeta', () => {
    assert.deepEqual(rangoDeEstado({ desde: '2026-03-01', hasta: '2026-04-15', categoria: 'taller_int' }),
        [{ desde: '2026-03-01', hasta: '2026-04-15', categoria: 'taller_int' }]);
});

test('sin fecha de inicio no se inventa un rango', () => {
    assert.deepEqual(rangoDeEstado({ desde: '', hasta: '2026-04-15', categoria: 'taller_int' }), []);
});

test('datosFaltantes lista lo vacio, incluso espacios, y respeta un 0', () => {
    assert.deepEqual(datosFaltantes({ interno: 'X1', dominio: 'AB123CD', marca: ' ', modelo: '', anio: 0, potencia: null }),
        ['marca', 'modelo', 'potencia']);
    assert.deepEqual(datosFaltantes({ dominio: 'A', marca: 'B', modelo: 'C', anio: 2020, potencia: '300' }), []);
});

test('altasConDatosPendientes solo mira altas automaticas y solo las incompletas', () => {
    const r = altasConDatosPendientes([
        { interno: 'N1', alta_automatica: true },
        { interno: 'N2', alta_automatica: true, dominio: 'A', marca: 'B', modelo: 'C', anio: 2020, potencia: '1' },
        { interno: 'M1' }
    ]);
    assert.deepEqual(r.map(x => x.equipo.interno), ['N1']);
    assert.equal(r[0].faltan.length, 5);
});

test('validarAlta limpia el interno y lo pasa a mayusculas', () => {
    assert.deepEqual(validarAlta('  tr77 ', [{ interno: 'TR01' }]), { ok: true, interno: 'TR77' });
});

test('validarAlta rechaza vacio y duplicado por clave normalizada', () => {
    assert.equal(validarAlta('', []).ok, false);
    const dup = validarAlta('tr 21', [{ interno: 'TR-21' }]);
    assert.equal(dup.ok, false);
    assert.match(dup.motivo, /TR-21/);
});

// --- fecha de venta y cargas posteriores ------------------------------------------------------

const vendido = (desde) => ({ interno: 'MX59', categoria: 'vendido', rangos: [{ desde, hasta: HASTA_ABIERTO, categoria: 'vendido' }] });
const filaCon = (interno, fechas) => ({ equipo: { interno, denominacion: 'MIXER' }, cargas: fechas.map(f => ({ fecha: f, litros: 100, importe: 240000 })) });

test('la fecha de venta es el inicio del estado vendido', () => {
    assert.equal(fechaDeVenta(vendido('2026-05-01')), '2026-05-01');
});

test('un estado que no es vendido no tiene fecha de venta', () => {
    assert.equal(fechaDeVenta({ interno: 'MX59', categoria: 'taller_ext', rangos: [{ desde: '2026-05-01', hasta: '2026-06-01', categoria: 'taller_ext' }] }), null);
    assert.equal(fechaDeVenta(null), null);
    assert.equal(fechaDeVenta({ interno: 'X', categoria: 'vendido', rangos: [] }), null);
});

test('con varios rangos vendido gana el mas temprano', () => {
    const e = { interno: 'MX59', categoria: 'vendido', rangos: [
        { desde: '2026-07-01', hasta: HASTA_ABIERTO, categoria: 'vendido' },
        { desde: '2026-05-01', hasta: HASTA_ABIERTO, categoria: 'vendido' }
    ] };
    assert.equal(fechaDeVenta(e), '2026-05-01');
});

test('las cargas ANTERIORES a la venta no son un problema: el equipo gasto eso siendo de la empresa', () => {
    const filas = [filaCon('MX59', ['2026-02-10', '2026-03-10', '2026-04-10'])];
    assert.deepEqual(cargasPosterioresALaVenta(filas, new Map([['MX59', vendido('2026-05-01')]])), []);
});

test('una carga del mismo dia de la venta todavia corresponde', () => {
    const filas = [filaCon('MX59', ['2026-05-01'])];
    assert.deepEqual(cargasPosterioresALaVenta(filas, new Map([['MX59', vendido('2026-05-01')]])), []);
});

test('las cargas posteriores a la venta se reportan con litros, importe y el rango de fechas', () => {
    const filas = [filaCon('MX59', ['2026-04-10', '2026-06-10', '2026-07-20'])];
    const r = cargasPosterioresALaVenta(filas, new Map([['MX59', vendido('2026-05-01')]]));
    assert.equal(r.length, 1);
    assert.equal(r[0].cargas, 2, 'solo las dos posteriores');
    assert.equal(r[0].litros, 200);
    assert.equal(r[0].importe, 480000);
    assert.equal(r[0].fecha_venta, '2026-05-01');
    assert.equal(r[0].primera, '2026-06-10');
    assert.equal(r[0].ultima, '2026-07-20');
});

test('un equipo sin estado vendido nunca entra al reporte', () => {
    const filas = [filaCon('TR21', ['2026-06-10'])];
    assert.deepEqual(cargasPosterioresALaVenta(filas, new Map()), []);
});

test('se ordena por litros: primero el caso mas grande', () => {
    const filas = [filaCon('A', ['2026-06-10']), filaCon('B', ['2026-06-10', '2026-07-10'])];
    const estados = new Map([['A', { ...vendido('2026-05-01'), interno: 'A' }], ['B', { ...vendido('2026-05-01'), interno: 'B' }]]);
    assert.deepEqual(cargasPosterioresALaVenta(filas, estados).map(x => x.interno), ['B', 'A']);
});
