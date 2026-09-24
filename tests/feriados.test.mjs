/**
 * Dias habiles y feriados.
 *
 * Lo que se verifica sale de la especificacion en CLAUDE.md ("Un mes cubierto a medias no
 * entra al ratio") y del decreto 614/2025, no de releer la implementacion: el corte de un mes
 * es su ultimo dia HABIL, y mayo de 2026 es el caso testigo — termina domingo 31, su ultima
 * carga real es del sabado 30, y la regla ingenua lo marcaria incompleto sin serlo.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    esFinDeSemana, esFeriado, esDiaHabil, ultimoDiaHabilDelMes, diasHabiles
} from '../js/data/feriados.js';

test('esFinDeSemana reconoce sabado y domingo, y solo esos', () => {
    assert.equal(esFinDeSemana('2026-05-30'), true, 'sabado');
    assert.equal(esFinDeSemana('2026-05-31'), true, 'domingo');
    assert.equal(esFinDeSemana('2026-05-29'), false, 'viernes');
    assert.equal(esFinDeSemana('2026-06-01'), false, 'lunes');
});

test('esFeriado reconoce los feriados fijos por ley', () => {
    assert.equal(esFeriado('2026-01-01'), true, 'Anio Nuevo');
    assert.equal(esFeriado('2026-05-01'), true, 'Dia del Trabajador');
    assert.equal(esFeriado('2026-07-09'), true, 'Independencia');
    assert.equal(esFeriado('2026-12-25'), true, 'Navidad');
});

test('esFeriado reconoce los moviles de 2026 cargados por decreto 614/2025', () => {
    assert.equal(esFeriado('2026-02-16'), true, 'Carnaval lunes');
    assert.equal(esFeriado('2026-02-17'), true, 'Carnaval martes');
    assert.equal(esFeriado('2026-04-03'), true, 'Viernes Santo');
    assert.equal(esFeriado('2026-08-17'), true, 'Gral. San Martin');
});

test('esFeriado no inventa fechas para un anio sin moviles cargados', () => {
    // 2030 no esta en la tabla de moviles: los fijos siguen valiendo, los moviles no se adivinan.
    assert.equal(esFeriado('2030-01-01'), true, 'fijo, se repite todos los anios');
    assert.equal(esFeriado('2030-02-16'), false, 'movil de otro anio, no se extrapola');
});

test('esDiaHabil excluye fin de semana y feriado', () => {
    assert.equal(esDiaHabil('2026-06-01'), true, 'lunes comun');
    assert.equal(esDiaHabil('2026-05-30'), false, 'sabado');
    assert.equal(esDiaHabil('2026-01-01'), false, 'feriado en dia de semana');
});

test('esDiaHabil devuelve false para una fecha vacia en vez de romper', () => {
    assert.equal(esDiaHabil(''), false);
    assert.equal(esDiaHabil(null), false);
    assert.equal(esDiaHabil(undefined), false);
});

test('ultimoDiaHabilDelMes retrocede cuando el mes termina en fin de semana', () => {
    // El caso testigo de CLAUDE.md: mayo 2026 termina domingo 31, sabado 30, viernes 29.
    assert.equal(ultimoDiaHabilDelMes('2026-05'), '2026-05-29');
});

test('ultimoDiaHabilDelMes es el ultimo del mes cuando ese dia es habil', () => {
    assert.equal(ultimoDiaHabilDelMes('2026-03'), '2026-03-31', 'martes');
});

test('ultimoDiaHabilDelMes contempla febrero y los anios bisiestos', () => {
    assert.equal(ultimoDiaHabilDelMes('2026-02'), '2026-02-27', '28 cae sabado');
    assert.equal(ultimoDiaHabilDelMes('2024-02'), '2024-02-29', 'bisiesto, jueves');
});

test('ultimoDiaHabilDelMes rechaza lo que no sea YYYY-MM', () => {
    assert.equal(ultimoDiaHabilDelMes('2026-5'), null);
    assert.equal(ultimoDiaHabilDelMes('2026-05-30'), null, 'una fecha completa no es un mes');
    assert.equal(ultimoDiaHabilDelMes(''), null);
    assert.equal(ultimoDiaHabilDelMes(null), null);
});

test('diasHabiles cuenta el sabado aparte y lo pondera a media jornada', () => {
    // Lunes 2026-06-01 a domingo 2026-06-07: 5 habiles, 1 sabado, 7 corridos.
    const r = diasHabiles('2026-06-01', '2026-06-07');
    assert.equal(r.dias, 5);
    assert.equal(r.sabados, 1);
    assert.equal(r.totalCorridos, 7);
    assert.equal(r.diasPonderados, 5.5);
});

test('diasHabiles descuenta el feriado que cae en dia de semana', () => {
    // Semana del 6 al 12 de julio de 2026: el 9 es feriado (Independencia), jueves.
    const r = diasHabiles('2026-07-06', '2026-07-12');
    assert.equal(r.dias, 4, 'lun-vie menos el feriado del jueves');
    assert.equal(r.sabados, 1);
});

test('un sabado que ademas es feriado no cuenta como sabado trabajado', () => {
    // 2026-06-20 es sabado Y Dia de la Bandera. No suma media jornada: no se trabaja.
    const r = diasHabiles('2026-06-15', '2026-06-21');
    assert.equal(r.dias, 4, 'lun-vie menos el feriado del miercoles 17 (Guemes)');
    assert.equal(r.sabados, 0, 'el sabado 20 es feriado');
    assert.equal(r.diasPonderados, 4);
});

test('diasHabiles marca completo:false cuando el anio no tiene moviles cargados', () => {
    assert.equal(diasHabiles('2026-06-01', '2026-06-07').completo, true);
    assert.equal(diasHabiles('2030-06-01', '2030-06-07').completo, false);
});

test('diasHabiles devuelve cero, no un error, ante un rango invalido', () => {
    for (const r of [
        diasHabiles('2026-06-07', '2026-06-01'),   // invertido
        diasHabiles('', '2026-06-01'),
        diasHabiles('2026-06-01', null)
    ]) {
        assert.equal(r.dias, 0);
        assert.equal(r.totalCorridos, 0);
    }
});

test('diasHabiles cuenta un solo dia cuando desde y hasta coinciden', () => {
    const r = diasHabiles('2026-06-01', '2026-06-01');
    assert.equal(r.totalCorridos, 1);
    assert.equal(r.dias, 1);
});
