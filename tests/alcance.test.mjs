/**
 * Alcance parcial: cuando lo subido cubre un solo tipo de equipo y solo algunos meses, la app
 * pregunta si analizar ese recorte o descartarlo y quedarse con el periodo comun de toda la flota.
 *
 * Reglas que fija este archivo (salen del pedido del usuario del 24/09/2026):
 *   - "siempre a mes completo": un resumen del 1 al 15 NO autoriza a recortar el analisis a ese mes.
 *   - solo se pregunta si el recorte es de UN tipo de equipo dentro de una flota con varios.
 *   - recortar por tipo tiene que sacar tambien los registros de los otros tipos: si quedaran como
 *     "no asignados" seguirian sumando a los totales (invariante 1b) y el recorte no recortaria nada.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { mesesCompletosDeRango, detectarAlcanceParcial, filtrarPorAlcance } from '../js/data/alcance.js';

// --- fixtures ---------------------------------------------------------------------------------

const FLOTA = [
    { interno: 'CM40', dominio: 'AA111AA' },
    { interno: 'CM42', dominio: 'AA222AA' },
    { interno: 'TR20', dominio: 'BB111BB' },
    { interno: 'MX108', dominio: 'CC111CC' }
];

const resumen = (interno, fecha, hasta) => ({ interno, fecha, fecha_hasta: hasta });
const agosto = (interno) => resumen(interno, '2026-08-01', '2026-08-31');
const carga = (interno, fecha) => ({ type: 'carga', interno, fecha, litros: 100 });

// --- mesesCompletosDeRango ---------------------------------------------------------------------

test('un rango que abarca el mes entero lo cuenta', () => {
    assert.deepEqual(mesesCompletosDeRango('2026-08-01', '2026-08-31'), ['2026-08']);
});

test('un rango parcial no cuenta ningun mes', () => {
    // El resumen del 1 al 15 de agosto no autoriza a decir "analizar agosto": el mes esta a medias.
    assert.deepEqual(mesesCompletosDeRango('2026-08-01', '2026-08-15'), []);
    assert.deepEqual(mesesCompletosDeRango('2026-08-10', '2026-08-31'), []);
});

test('un rango de varios meses cuenta solo los que cubre enteros', () => {
    // 15/07 al 31/08: julio quedo a medias, agosto entero.
    assert.deepEqual(mesesCompletosDeRango('2026-07-15', '2026-08-31'), ['2026-08']);
    assert.deepEqual(mesesCompletosDeRango('2026-01-01', '2026-03-31'), ['2026-01', '2026-02', '2026-03']);
});

test('febrero se cubre entero en su ultimo dia real, bisiesto o no', () => {
    assert.deepEqual(mesesCompletosDeRango('2026-02-01', '2026-02-28'), ['2026-02']);
    assert.deepEqual(mesesCompletosDeRango('2026-02-01', '2026-02-27'), []);
    assert.deepEqual(mesesCompletosDeRango('2024-02-01', '2024-02-29'), ['2024-02']);
});

test('fechas vacias, mal formadas o invertidas no dan ningun mes', () => {
    for (const [d, h] of [['', ''], [null, undefined], ['x', 'y'], ['2026-08-31', '2026-08-01']]) {
        assert.deepEqual(mesesCompletosDeRango(d, h), [], `${d} -> ${h}`);
    }
});

// --- detectarAlcanceParcial --------------------------------------------------------------------

test('resumenes solo de camionetas, de agosto, en una flota con varios tipos: hay que preguntar', () => {
    const r = detectarAlcanceParcial([agosto('CM-40'), agosto('CM-42')], FLOTA);
    assert.equal(r.denominacion, 'CAMIONETA');
    assert.deepEqual(r.meses, ['2026-08']);
    assert.deepEqual(r.unidades, ['CM40', 'CM42']);
});

test('reconoce la unidad aunque el resumen la escriba con guion', () => {
    // El Resumen de viaje real dice "CM-40"; el maestro tiene "CM40".
    assert.deepEqual(detectarAlcanceParcial([agosto('CM-40')], FLOTA).unidades, ['CM40']);
});

test('resumenes de mas de un tipo de equipo no son un recorte: no se pregunta nada', () => {
    assert.equal(detectarAlcanceParcial([agosto('CM-40'), agosto('TR-20')], FLOTA), null);
});

test('si la flota tiene un solo tipo, no hay recorte posible', () => {
    const soloCamionetas = FLOTA.filter(e => e.interno.startsWith('CM'));
    assert.equal(detectarAlcanceParcial([agosto('CM-40')], soloCamionetas), null);
});

test('un resumen a medias no autoriza a preguntar por ese mes', () => {
    assert.equal(detectarAlcanceParcial([resumen('CM-40', '2026-08-01', '2026-08-15')], FLOTA), null);
});

test('un resumen de una unidad que no esta en el maestro se ignora', () => {
    assert.equal(detectarAlcanceParcial([agosto('ZZ-99')], FLOTA), null);
    const r = detectarAlcanceParcial([agosto('ZZ-99'), agosto('CM-40')], FLOTA);
    assert.deepEqual(r.unidades, ['CM40'], 'la desconocida no cuenta ni como tipo distinto');
});

test('sin resumenes o sin flota no hay nada que preguntar', () => {
    assert.equal(detectarAlcanceParcial([], FLOTA), null);
    assert.equal(detectarAlcanceParcial([agosto('CM-40')], []), null);
    assert.equal(detectarAlcanceParcial(), null);
});

test('la firma cambia cuando cambian las unidades o los meses, y no con el orden', () => {
    const a = detectarAlcanceParcial([agosto('CM-40'), agosto('CM-42')], FLOTA).firma;
    const b = detectarAlcanceParcial([agosto('CM-42'), agosto('CM-40')], FLOTA).firma;
    const c = detectarAlcanceParcial([agosto('CM-40')], FLOTA).firma;
    const d = detectarAlcanceParcial([resumen('CM-40', '2026-07-01', '2026-07-31'), resumen('CM-42', '2026-07-01', '2026-07-31')], FLOTA).firma;
    assert.equal(a, b, 'el orden en que se subieron no importa');
    assert.notEqual(a, c, 'otra cantidad de unidades es otro conjunto');
    assert.notEqual(a, d, 'otro mes es otro conjunto');
});

// --- filtrarPorAlcance -------------------------------------------------------------------------

test('recortar por tipo deja solo los equipos de ese tipo', () => {
    const r = filtrarPorAlcance(FLOTA, [], { denominacion: 'CAMIONETA' });
    assert.deepEqual(r.equipos.map(e => e.interno), ['CM40', 'CM42']);
});

test('recortar por tipo saca tambien los registros de los otros tipos', () => {
    // Si solo se filtraran los equipos, estos registros quedarian como "no asignados" y seguirian
    // sumando litros a los totales.
    const registros = [carga('CM40', '2026-08-05'), carga('TR20', '2026-08-05'), carga('MX108', '2026-08-06'), carga('CM42', '2026-08-07')];
    const r = filtrarPorAlcance(FLOTA, registros, { denominacion: 'CAMIONETA' });
    assert.deepEqual(r.rawRecords.map(x => x.interno), ['CM40', 'CM42']);
});

test('recortar por tipo tambien reconoce el registro que trae solo la patente', () => {
    const r = filtrarPorAlcance(FLOTA, [{ type: 'gps', dominio: 'AA222AA', fecha: '2026-08-01' }], { denominacion: 'CAMIONETA' });
    assert.equal(r.rawRecords.length, 1);
});

test('sin alcance no se toca nada, y devuelve lo mismo que recibio', () => {
    const registros = [carga('TR20', '2026-08-05')];
    for (const alcance of [null, undefined, {}, { denominacion: '' }]) {
        const r = filtrarPorAlcance(FLOTA, registros, alcance);
        assert.equal(r.equipos, FLOTA);
        assert.equal(r.rawRecords, registros);
    }
});

test('un tipo que no existe en la flota da un universo vacio, no todo', () => {
    const r = filtrarPorAlcance(FLOTA, [carga('CM40', '2026-08-05')], { denominacion: 'AVION' });
    assert.deepEqual(r.equipos, []);
    assert.deepEqual(r.rawRecords, []);
});
