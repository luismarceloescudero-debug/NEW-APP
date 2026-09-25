/**
 * Servicios de planta: que un mes sin cargas se explique (temporada baja en ARIDOS, fuera de servicio
 * en otro lugar) en vez de tratarse como falla, y que la comparacion sea contra el par mas parecido.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { esServicioPlanta, cargaEnAridos, inferirEstadoPlanta, paresComparables } from '../js/data/planta.js';

const periodo = { desde: '2026-01-01', hasta: '2026-08-31' };
const carga = (fecha, lugar = 'GRIS', sector = '') => ({ fecha, lugar_carga: lugar, sector });

// --- que es un servicio de planta -------------------------------------------------------------

test('CA, CL, LM y MT son servicios de planta; un mixer o un tractor no', () => {
    for (const i of ['CA01', 'CL03', 'LM01', 'MT04', 'cl-02']) assert.equal(esServicioPlanta(i), true, i);
    for (const i of ['MX59', 'TR20', 'GE01', 'CM42']) assert.equal(esServicioPlanta(i), false, i);
});

// --- estado asumido en los meses sin cargas ---------------------------------------------------

test('carga en ARIDOS con meses sin cargas: se asume temporada baja', () => {
    const r = inferirEstadoPlanta({ cargas: [carga('2026-01-10', 'ARIDOS'), carga('2026-02-10', 'ARIDOS'), carga('2026-08-05', 'ARIDOS')], periodo });
    assert.equal(r.categoria, 'temporada_baja');
    assert.deepEqual(r.mesesSinCarga, ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07']);
    assert.match(r.motivo, /temporada baja/);
});

test('carga fuera de ARIDOS con meses sin cargas: se asume fuera de servicio', () => {
    const r = inferirEstadoPlanta({ cargas: [carga('2026-01-10', 'TUNUYAN'), carga('2026-08-10', 'TUNUYAN')], periodo });
    assert.equal(r.categoria, 'fuera_servicio');
    assert.match(r.motivo, /fuera de servicio/);
});

test('el sector ARIDOS tambien cuenta aunque el lugar de carga sea otro', () => {
    assert.equal(cargaEnAridos([carga('2026-01-10', 'GRIS', 'ARIDOS')]), true);
});

test('mitad y mitad se inclina a ARIDOS; menos de la mitad no', () => {
    assert.equal(cargaEnAridos([carga('2026-01-10', 'ARIDOS'), carga('2026-02-10', 'GRIS')]), true);
    assert.equal(cargaEnAridos([carga('2026-01-10', 'ARIDOS'), carga('2026-02-10', 'GRIS'), carga('2026-03-10', 'GRIS')]), false);
});

test('los rangos agrupan meses consecutivos y llevan el ultimo dia real de cada mes', () => {
    const r = inferirEstadoPlanta({ cargas: [carga('2026-01-10', 'ARIDOS'), carga('2026-02-10', 'ARIDOS'), carga('2026-06-10', 'ARIDOS'), carga('2026-08-10', 'ARIDOS')], periodo });
    assert.deepEqual(r.rangos, [
        { desde: '2026-03-01', hasta: '2026-05-31', categoria: 'temporada_baja' },
        { desde: '2026-07-01', hasta: '2026-07-31', categoria: 'temporada_baja' }
    ]);
});

test('febrero termina el 28 en 2026', () => {
    const r = inferirEstadoPlanta({ cargas: [carga('2026-01-10', 'ARIDOS'), carga('2026-03-10', 'ARIDOS')], periodo: { desde: '2026-01-01', hasta: '2026-03-31' } });
    assert.equal(r.rangos[0].hasta, '2026-02-28');
});

test('si cargo todos los meses no hay nada que asumir', () => {
    const cargas = ['01', '02', '03', '04', '05', '06', '07', '08'].map(m => carga(`2026-${m}-10`, 'ARIDOS'));
    assert.equal(inferirEstadoPlanta({ cargas, periodo }), null);
});

test('sin ninguna carga no se asume nada: no hay de donde deducir el lugar', () => {
    assert.equal(inferirEstadoPlanta({ cargas: [], periodo }), null);
});

test('las cargas fuera del periodo no cuentan como mes con carga', () => {
    // Solo hay una carga de septiembre: dentro de ene-ago no cargo ningun mes.
    assert.equal(inferirEstadoPlanta({ cargas: [carga('2026-09-10', 'ARIDOS')], periodo }), null);
});

test('un mes suelto de cargas tambien deja el resto asumido', () => {
    const r = inferirEstadoPlanta({ cargas: [carga('2026-05-20', 'ARIDOS')], periodo });
    assert.equal(r.mesesConCarga.length, 1);
    assert.equal(r.mesesSinCarga.length, 7);
});

// --- pares comparables ------------------------------------------------------------------------

const eq = (interno, extra = {}) => ({ interno, ...extra });

test('solo se comparan equipos del mismo tipo', () => {
    const r = paresComparables(eq('CL02'), [eq('CL03'), eq('CA01'), eq('MX59')]);
    assert.deepEqual(r.map(p => p.equipo.interno), ['CL03']);
});

test('nunca se compara un equipo consigo mismo', () => {
    assert.deepEqual(paresComparables(eq('CL02'), [eq('CL02')]), []);
});

test('gana el que coincide en mas de marca, modelo, potencia y capacidad', () => {
    const base = eq('CL02', { marca: 'ROCA', modelo: 'X1', potencia: '20 KW', capacidad: '100' });
    const r = paresComparables(base, [
        eq('CL03', { marca: 'ROCA', modelo: 'X9', potencia: '30 KW' }),
        eq('CL04', { marca: 'ROCA', modelo: 'X1', potencia: '20 KW' })
    ]);
    assert.equal(r[0].equipo.interno, 'CL04');
    assert.deepEqual(r[0].coincide, ['marca', 'modelo', 'potencia']);
});

test('a igual puntaje gana el anio mas cercano', () => {
    const base = eq('CL02', { marca: 'ROCA', anio: 2018 });
    const r = paresComparables(base, [
        eq('CL03', { marca: 'ROCA', anio: 2010 }),
        eq('CL04', { marca: 'ROCA', anio: 2017 }),
        eq('CL05', { marca: 'ROCA', anio: 2022 })
    ]);
    assert.deepEqual(r.map(p => p.equipo.interno), ['CL04', 'CL05', 'CL03']);
    assert.equal(r[0].deltaAnio, 1);
});

test('un par sin anio va despues de los que si lo tienen', () => {
    const base = eq('CL02', { anio: 2018 });
    const r = paresComparables(base, [eq('CL03'), eq('CL04', { anio: 2000 })]);
    assert.deepEqual(r.map(p => p.equipo.interno), ['CL04', 'CL03']);
});

test('las marcas se comparan sin importar mayusculas ni espacios', () => {
    const r = paresComparables(eq('CL02', { marca: 'Roca ' }), [eq('CL03', { marca: 'ROCA' })]);
    assert.deepEqual(r[0].coincide, ['marca']);
});

test('dos campos vacios no cuentan como coincidencia', () => {
    const r = paresComparables(eq('CL02'), [eq('CL03')]);
    assert.deepEqual(r[0].coincide, []);
});
