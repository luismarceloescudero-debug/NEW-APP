/**
 * Consumos marcados para revisar: que el patron se clasifique con los MISMOS umbrales que los
 * hallazgos (invariante 2), y que al re-evaluar meses despues el veredicto distinga las cuatro
 * situaciones posibles — explicado por un estado, normalizado, persiste, o sin datos.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    PATRONES_CONSUMO, PATRON_LABEL, ESTADOS_QUE_EXPLICAN,
    patronesDe, fotoDeConsumo, rangosSolapan, evaluarRevision, evaluarRevisiones
} from '../js/data/revision-consumo.js';
import { TOLERANCIA_DESVIO } from '../js/data/diagnostico.js';

const periodo = { desde: '2026-01-01', hasta: '2026-08-31' };

/** Una fila de analizarFlota() con lo minimo que mira este modulo. */
const fila = (interno, { desvio = null, cargas = [], meta = 10, consumo = 10 } = {}) => ({
    equipo: { interno, denominacion: 'TRACTOR' },
    confirmed: meta ? { valor: meta } : null,
    cargas,
    metrics: { desvio_pct: desvio, consumo_real: consumo, tipo_calculo: 'L/Hora', cantidad_cargas: cargas.length, total_litros: 100 }
});

/** Cargas regulares: un mes tras otro, para que cadenciaCargas() las de por regulares. */
const cargasRegulares = ['01', '02', '03', '04', '05', '06', '07', '08'].map(m => ({ fecha: `2026-${m}-10`, litros: 50 }));
const cargasSalteadas = [{ fecha: '2026-01-10', litros: 50 }, { fecha: '2026-08-10', litros: 50 }];

// --- los patrones y sus umbrales --------------------------------------------------------------

test('los tres patrones tienen id y label, sin repetidos', () => {
    const ids = PATRONES_CONSUMO.map(p => p.id);
    assert.deepEqual(ids, ['alto', 'bajo', 'esporadico']);
    assert.equal(new Set(ids).size, 3);
    for (const id of ids) assert.ok(PATRON_LABEL[id], id);
});

test('alto y bajo usan la tolerancia de los hallazgos, no un umbral propio', () => {
    const limite = TOLERANCIA_DESVIO * 100;
    assert.deepEqual(patronesDe(fila('A', { desvio: limite + 1, cargas: cargasRegulares }), periodo), ['alto']);
    assert.deepEqual(patronesDe(fila('B', { desvio: -limite - 1, cargas: cargasRegulares }), periodo), ['bajo']);
    // Justo en el umbral no alcanza: es el mismo > estricto que usa el hallazgo de sobreconsumo.
    assert.deepEqual(patronesDe(fila('C', { desvio: limite, cargas: cargasRegulares }), periodo), []);
    assert.deepEqual(patronesDe(fila('D', { desvio: -limite, cargas: cargasRegulares }), periodo), []);
});

test('un equipo sin meta no tiene desvio, asi que no es ni alto ni bajo', () => {
    assert.deepEqual(patronesDe(fila('E', { desvio: null, cargas: cargasRegulares }), periodo), []);
});

test('cargar en dos de ocho meses es esporadico; mes a mes no', () => {
    assert.deepEqual(patronesDe(fila('F', { desvio: 0, cargas: cargasSalteadas }), periodo), ['esporadico']);
    assert.deepEqual(patronesDe(fila('G', { desvio: 0, cargas: cargasRegulares }), periodo), []);
});

test('un equipo puede ser alto y esporadico a la vez', () => {
    assert.deepEqual(patronesDe(fila('H', { desvio: 40, cargas: cargasSalteadas }), periodo), ['alto', 'esporadico']);
});

// --- la foto que se guarda --------------------------------------------------------------------

test('la foto guarda el periodo: sin el no hay contra que comparar despues', () => {
    const f = fotoDeConsumo(fila('TR21', { desvio: 30, cargas: cargasRegulares, meta: 12, consumo: 15.6 }), 'alto', periodo, 'revisar inyectores');
    assert.equal(f.interno, 'TR21');
    assert.equal(f.patron, 'alto');
    assert.equal(f.nota, 'revisar inyectores');
    assert.equal(f.periodo_desde, '2026-01-01');
    assert.equal(f.periodo_hasta, '2026-08-31');
    assert.equal(f.desvio_pct, 30);
    assert.equal(f.meta, 12);
    assert.equal(f.consumo_real, 15.6);
    assert.equal(f.unidad, 'L/Hora');
    assert.equal(f.cargas, 8);
    assert.equal(f.meses_con_carga, 8);
    assert.ok(f.fecha, 'sin fecha no se puede decir "marcado hace dos meses"');
});

// --- solapamiento de rangos -------------------------------------------------------------------

test('un estado abierto (sin fecha de fin real) solapa con el periodo', () => {
    assert.equal(rangosSolapan([{ desde: '2026-05-01', hasta: '2099-12-31' }], '2026-01-01', '2026-08-31'), true);
});

test('un estado que termino antes del periodo no solapa', () => {
    assert.equal(rangosSolapan([{ desde: '2025-01-01', hasta: '2025-12-31' }], '2026-01-01', '2026-08-31'), false);
});

test('un estado que empieza despues del periodo no solapa', () => {
    assert.equal(rangosSolapan([{ desde: '2026-09-01', hasta: '2026-10-31' }], '2026-01-01', '2026-08-31'), false);
});

test('tocar el borde exacto del periodo cuenta como solape', () => {
    assert.equal(rangosSolapan([{ desde: '2026-08-31', hasta: '2026-09-15' }], '2026-01-01', '2026-08-31'), true);
    assert.equal(rangosSolapan([{ desde: '2025-12-01', hasta: '2026-01-01' }], '2026-01-01', '2026-08-31'), true);
});

test('sin rangos, o sin periodo, no hay solape que afirmar', () => {
    assert.equal(rangosSolapan([], '2026-01-01', '2026-08-31'), false);
    assert.equal(rangosSolapan([{ desde: '2026-01-01', hasta: '2026-12-31' }], null, null), false);
});

// --- el veredicto al re-evaluar ---------------------------------------------------------------

const foto = (patron, desvio) => ({ interno: 'TR21', patron, desvio_pct: desvio, periodo_desde: '2026-01-01', periodo_hasta: '2026-08-31' });

test('un estado que se solapa explica el numero raro', () => {
    const estado = { interno: 'TR21', categoria: 'taller_ext', motivo: 'caja', rangos: [{ desde: '2026-03-01', hasta: '2026-05-31' }] };
    const r = evaluarRevision(foto('bajo', -40), fila('TR21', { desvio: -40, cargas: cargasRegulares }), estado, periodo);
    assert.equal(r.estado, 'explicado');
    assert.equal(r.categoria, 'taller_ext');
    assert.match(r.motivo, /se solapa/);
});

test('un estado sin fechas se informa como contexto, pero diciendo que no se pudo verificar', () => {
    const estado = { interno: 'TR21', categoria: 'temporada_baja', motivo: '', rangos: [] };
    const r = evaluarRevision(foto('bajo', -40), fila('TR21', { desvio: -40, cargas: cargasRegulares }), estado, periodo);
    assert.equal(r.estado, 'explicado');
    assert.match(r.motivo, /sin fechas/);
});

test('un estado que NO se solapa no explica nada: se sigue evaluando el dato', () => {
    const estado = { interno: 'TR21', categoria: 'taller_int', rangos: [{ desde: '2025-01-01', hasta: '2025-02-28' }] };
    const r = evaluarRevision(foto('alto', 30), fila('TR21', { desvio: 35, cargas: cargasRegulares }), estado, periodo);
    assert.equal(r.estado, 'persiste');
});

test('una categoria que no explica un consumo (otro) no cuenta como explicacion', () => {
    assert.equal(ESTADOS_QUE_EXPLICAN.includes('otro'), false);
    const estado = { interno: 'TR21', categoria: 'otro', rangos: [{ desde: '2026-01-01', hasta: '2026-12-31' }] };
    assert.equal(evaluarRevision(foto('alto', 30), fila('TR21', { desvio: 35, cargas: cargasRegulares }), estado, periodo).estado, 'persiste');
});

test('si el patron ya no aparece, el consumo se normalizo', () => {
    const r = evaluarRevision(foto('alto', 30), fila('TR21', { desvio: 4, cargas: cargasRegulares }), null, periodo);
    assert.equal(r.estado, 'normalizado');
    assert.match(r.detalle, /\+4%/);
});

test('si el patron sigue, persiste y se ve el antes y el despues', () => {
    const r = evaluarRevision(foto('alto', 30), fila('TR21', { desvio: 52, cargas: cargasRegulares }), null, periodo);
    assert.equal(r.estado, 'persiste');
    assert.match(r.detalle, /\+30%.*\+52%/);
});

test('sin cargas en el periodo actual no se puede comparar', () => {
    assert.equal(evaluarRevision(foto('alto', 30), fila('TR21', { desvio: null, cargas: [] }), null, periodo).estado, 'sin_datos');
    assert.equal(evaluarRevision(foto('alto', 30), null, null, periodo).estado, 'sin_datos');
});

test('un estado explica incluso sin datos nuevos: el contexto gana al "no se puede comparar"', () => {
    const estado = { interno: 'TR21', categoria: 'vendido', rangos: [{ desde: '2026-04-01', hasta: '2099-12-31' }] };
    assert.equal(evaluarRevision(foto('bajo', -50), null, estado, periodo).estado, 'explicado');
});

// --- la lista completa ------------------------------------------------------------------------

test('las revisiones se ordenan por lo que necesita atencion: persiste primero, normalizado al final', () => {
    const revisiones = [
        foto('alto', 30), { ...foto('alto', 30), interno: 'MX59' }, { ...foto('bajo', -40), interno: 'GE01' }
    ];
    const filas = [
        fila('TR21', { desvio: 50, cargas: cargasRegulares }),   // persiste
        fila('MX59', { desvio: 2, cargas: cargasRegulares }),    // normalizado
        fila('GE01', { desvio: -40, cargas: cargasRegulares })   // explicado
    ];
    const estados = new Map([['GE01', { interno: 'GE01', categoria: 'temporada_baja', rangos: [{ desde: '2026-02-01', hasta: '2026-06-30' }] }]]);
    const r = evaluarRevisiones(revisiones, filas, estados, periodo);
    assert.deepEqual(r.map(x => x.resultado.estado), ['persiste', 'explicado', 'normalizado']);
    assert.deepEqual(r.map(x => x.revision.interno), ['TR21', 'GE01', 'MX59']);
});

test('la revision encuentra su fila aunque el interno este escrito distinto', () => {
    const r = evaluarRevisiones([{ ...foto('alto', 30), interno: 'TR-21' }], [fila('TR 21', { desvio: 50, cargas: cargasRegulares })], new Map(), periodo);
    assert.equal(r[0].resultado.estado, 'persiste', 'TR-21 y TR 21 son el mismo equipo');
});

test('sin revisiones guardadas la lista queda vacia', () => {
    assert.deepEqual(evaluarRevisiones([], [fila('TR21', { desvio: 50 })], new Map(), periodo), []);
});
