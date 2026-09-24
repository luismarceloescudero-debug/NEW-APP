/**
 * Alineacion de periodos — la invariante 1 de CLAUDE.md.
 *
 * Una razon (litros / actividad) solo vale si los dos operandos vienen de los mismos meses.
 * La trampa que hace este bug invisible: el campo `periodo` de un registro es solo el mes de
 * su fecha de INICIO, asi que un GPS Ene-Jul lleva `periodo: '2026-01'` y mide siete meses.
 * Agrupar por `r.periodo` lo cuenta como enero. Hay que usar mesesDeRegistro(r).
 *
 * Y la regla del mes cubierto a medias: un mes que la FUENTE corta por la mitad sale del
 * comun, porque si no el numerador es de dos tercios de mes y el denominador del mes entero
 * — ~30% mas bajo, plausible y mal, en toda la flota a la vez.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    mesesEntre, mesesDeRegistro, mesesCompletosDeFuente, alinearCargasYGps,
    calculateAlignedPeriod, periodosAnalisisAutomatico, rangoCalendarioDePeriodos,
    periodosDisponibles, sumHoras, desgloseHoras, registroVacio
} from '../js/data/analyzer.js';

const carga = (fecha) => ({ tipo: 'CARGAS', fecha, litros: 100 });
const gpsMes = (ym, dias = 31) => ({
    tipo: 'GPS', fecha: `${ym}-01`, fecha_hasta: `${ym}-${String(dias).padStart(2, '0')}`,
    distancia: 500, horas: { movimiento: 0.5 }
});

// --- mesesEntre ---------------------------------------------------------------------------

test('mesesEntre enumera el rango completo, inclusive', () => {
    assert.deepEqual(mesesEntre('2026-01', '2026-03'), ['2026-01', '2026-02', '2026-03']);
});

test('mesesEntre cruza el cambio de anio', () => {
    assert.deepEqual(mesesEntre('2025-11', '2026-02'),
        ['2025-11', '2025-12', '2026-01', '2026-02']);
});

test('mesesEntre devuelve solo el inicio cuando el fin es anterior o igual', () => {
    assert.deepEqual(mesesEntre('2026-03', '2026-01'), ['2026-03']);
    assert.deepEqual(mesesEntre('2026-03', '2026-03'), ['2026-03']);
});

test('mesesEntre devuelve vacio ante un mes mal formado, no una lista rara', () => {
    for (const v of ['', null, undefined, '2026', '2026-1', 'x']) {
        assert.deepEqual(mesesEntre(v, '2026-03'), []);
    }
});

// --- mesesDeRegistro: LA TRAMPA -----------------------------------------------------------

test('mesesDeRegistro cuenta los siete meses de un GPS Ene-Jul, no solo enero', () => {
    // Este es el bug de la invariante 1: agrupar por r.periodo lo contaria como enero solo.
    const gps = { fecha: '2026-01-01', fecha_hasta: '2026-07-31', periodo: '2026-01' };
    assert.deepEqual(mesesDeRegistro(gps),
        ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07']);
    assert.equal(mesesDeRegistro(gps).length, 7, 'siete meses, no uno');
});

test('mesesDeRegistro de una carga suelta es un solo mes', () => {
    assert.deepEqual(mesesDeRegistro({ fecha: '2026-03-15' }), ['2026-03']);
});

test('mesesDeRegistro de un GPS mensual es ese unico mes', () => {
    assert.deepEqual(mesesDeRegistro(gpsMes('2026-01')), ['2026-01']);
});

test('mesesDeRegistro devuelve vacio cuando no hay fecha', () => {
    for (const r of [{}, { fecha: '' }, { fecha: null }]) {
        assert.deepEqual(mesesDeRegistro(r), []);
    }
});

// --- mesesCompletosDeFuente ---------------------------------------------------------------

test('un mes cuya ultima carga es el ultimo dia habil esta completo', () => {
    // Mayo 2026 termina domingo 31; la ultima carga real es del sabado 30. El corte es el
    // viernes 29, asi que mayo esta completo — la regla ingenua lo marcaria incompleto.
    const { completos, incompletos } = mesesCompletosDeFuente([
        carga('2026-05-02'), carga('2026-05-30')
    ]);
    assert.ok(completos.has('2026-05'), 'mayo deberia estar completo');
    assert.equal(incompletos.has('2026-05'), false);
});

test('un mes cortado antes de su ultimo dia habil queda incompleto, con el detalle', () => {
    // El caso real: septiembre 2026 con la ultima carga del dia 21 de 30.
    const { completos, incompletos } = mesesCompletosDeFuente([
        carga('2026-09-01'), carga('2026-09-21')
    ]);
    assert.equal(completos.has('2026-09'), false);
    assert.deepEqual(incompletos.get('2026-09'), { hasta: '2026-09-21', esperado: '2026-09-30' });
});

test('un reporte multi-mes cierra todos los meses que cubre salvo el ultimo', () => {
    const { completos, incompletos } = mesesCompletosDeFuente(
        [{ fecha: '2026-01-01', fecha_hasta: '2026-03-15' }], 'fecha_hasta'
    );
    assert.ok(completos.has('2026-01'), 'enero queda cerrado por el rango');
    assert.ok(completos.has('2026-02'));
    assert.equal(completos.has('2026-03'), false, 'marzo es el que puede quedar a medias');
    assert.equal(incompletos.get('2026-03').hasta, '2026-03-15');
});

test('mesesCompletosDeFuente ignora las filas sin fecha valida en vez de romper', () => {
    const { completos } = mesesCompletosDeFuente([
        null, {}, { fecha: 'sin fecha' }, carga('2026-03-31')
    ]);
    assert.ok(completos.has('2026-03'));
    assert.equal(completos.size, 1);
});

test('mesesCompletosDeFuente sobre una lista vacia no devuelve nada', () => {
    const { completos, incompletos } = mesesCompletosDeFuente([]);
    assert.equal(completos.size, 0);
    assert.equal(incompletos.size, 0);
});

// --- alinearCargasYGps: la invariante ------------------------------------------------------

test('alinearCargasYGps se queda solo con los meses que tienen las dos fuentes', () => {
    const cargas = [carga('2026-01-10'), carga('2026-02-10'), carga('2026-03-10')];
    const gps = [gpsMes('2026-02', 28), gpsMes('2026-03')];

    const r = alinearCargasYGps(cargas, gps);
    assert.deepEqual(r.meses, ['2026-02', '2026-03']);
    assert.equal(r.cargas.length, 2, 'la carga de enero sale: no hay GPS de enero');
    assert.equal(r.cargasFuera, 1);
});

test('alinearCargasYGps declara alineado solo cuando las dos fuentes cubren lo mismo', () => {
    const iguales = alinearCargasYGps(
        [carga('2026-01-10'), carga('2026-02-10')],
        [gpsMes('2026-01'), gpsMes('2026-02', 28)]
    );
    assert.equal(iguales.alineado, true);

    const distintos = alinearCargasYGps(
        [carga('2026-01-10'), carga('2026-02-10')],
        [gpsMes('2026-02', 28)]
    );
    assert.equal(distintos.alineado, false);
});

test('un GPS que se pasa de los meses comunes se descarta entero, no a medias', () => {
    // Traeria km de un periodo que no se esta midiendo.
    const cargas = [carga('2026-01-10')];
    const gpsLargo = { tipo: 'GPS', fecha: '2026-01-01', fecha_hasta: '2026-07-31', distancia: 5000 };

    const r = alinearCargasYGps(cargas, [gpsLargo]);
    assert.equal(r.gps.length, 0, 'no entra: cubre meses sin cargas');
    assert.equal(r.gpsParcial, 1, 'y se declara como parcial');
});

test('alinearCargasYGps saca del comun un mes que la fuente cubre a medias, y lo declara', () => {
    const cargas = [carga('2026-01-10'), carga('2026-02-10')];
    const gps = [gpsMes('2026-01'), gpsMes('2026-02', 28)];

    const r = alinearCargasYGps(cargas, gps, new Set(['2026-02']));
    assert.deepEqual(r.meses, ['2026-01'], 'febrero sale del ratio');
    assert.deepEqual(r.mesesIncompletosRecortados, ['2026-02'],
        'un mes que desaparece sin explicacion es peor que el problema que se evita');
});

test('alinearCargasYGps marca sinMesComun cuando las fuentes no se tocan', () => {
    const r = alinearCargasYGps([carga('2026-01-10')], [gpsMes('2026-05')]);
    assert.equal(r.sinMesComun, true);
    assert.equal(r.meses.length, 0);
});

test('alinearCargasYGps con una sola fuente no inventa un mes comun', () => {
    const soloCargas = alinearCargasYGps([carga('2026-01-10')], []);
    assert.equal(soloCargas.meses.length, 0);
    assert.equal(soloCargas.sinMesComun, false, 'no hay conflicto: falta una fuente entera');
});

test('alinearCargasYGps sobre listas vacias devuelve una estructura vacia, no undefined', () => {
    const r = alinearCargasYGps([], []);
    assert.deepEqual(r.cargas, []);
    assert.deepEqual(r.gps, []);
    assert.deepEqual(r.meses, []);
    assert.equal(r.alineado, false);
});

// --- periodo automatico --------------------------------------------------------------------

test('periodosAnalisisAutomatico toma el tramo consecutivo mas largo del cruce', () => {
    const cargas = ['2026-01', '2026-02', '2026-03', '2026-06']
        .map(ym => carga(`${ym}-10`));
    const gps = ['2026-01', '2026-02', '2026-03', '2026-06'].map(ym => gpsMes(ym, 28));

    assert.deepEqual(periodosAnalisisAutomatico(cargas, gps),
        ['2026-01', '2026-02', '2026-03'], 'un hueco no se tapa inventando continuidad');
});

test('periodosAnalisisAutomatico usa la fuente que exista cuando falta la otra', () => {
    const cargas = [carga('2026-01-10'), carga('2026-02-10')];
    assert.deepEqual(periodosAnalisisAutomatico(cargas, []), ['2026-01', '2026-02']);
});

test('rangoCalendarioDePeriodos abre el primero y cierra el ultimo dia real del mes', () => {
    assert.deepEqual(rangoCalendarioDePeriodos(['2026-01', '2026-02']),
        { desde: '2026-01-01', hasta: '2026-02-28' });
    assert.deepEqual(rangoCalendarioDePeriodos(['2024-02']),
        { desde: '2024-02-01', hasta: '2024-02-29' }, 'bisiesto');
});

test('rangoCalendarioDePeriodos devuelve nulls ante una lista vacia o invalida', () => {
    assert.deepEqual(rangoCalendarioDePeriodos([]), { desde: null, hasta: null });
    assert.deepEqual(rangoCalendarioDePeriodos(['x', '2026']), { desde: null, hasta: null });
});

test('calculateAlignedPeriod devuelve la interseccion de los dos rangos', () => {
    // Cargas feb-mar, GPS solo marzo: el tramo con las dos fuentes empieza el 1 de marzo.
    assert.deepEqual(
        calculateAlignedPeriod([carga('2026-02-10'), carga('2026-03-10')], [gpsMes('2026-03')]),
        { start: '2026-03-01', end: '2026-03-10' }
    );
});

test('calculateAlignedPeriod cae a la union cuando los rangos no se superponen', () => {
    // Una interseccion invertida (start > end) no es un periodo: en vez de devolver algo
    // imposible, se abre a la union para que el usuario vea que las fuentes no se tocan.
    assert.deepEqual(
        calculateAlignedPeriod([carga('2026-01-10')], [gpsMes('2026-05', 31)]),
        { start: '2026-01-10', end: '2026-05-31' }
    );
});

test('calculateAlignedPeriod usa la fuente que exista cuando falta la otra', () => {
    assert.deepEqual(
        calculateAlignedPeriod([carga('2026-02-10'), carga('2026-03-10')], []),
        { start: '2026-02-10', end: '2026-03-10' }
    );
    assert.deepEqual(calculateAlignedPeriod([], []), { start: null, end: null });
});

// --- horas ------------------------------------------------------------------------------------

// El GPS llega al analyzer ya agregado por aggregateHours(): `horas` viene en HORAS y con
// `total` calculado. Los fixtures de acá respetan esa forma.
const horasGps = (ralenti, movimiento, parado = 0) => ({
    ralenti, movimiento, parado, total: ralenti + movimiento + parado
});

test('sumHoras totaliza el campo total de cada GPS', () => {
    assert.equal(sumHoras([
        { horas: horasGps(6, 12) },
        { horas: horasGps(3, 9) }
    ]), 30);
});

test('sumHoras acepta un GPS cuyas horas vienen como numero suelto', () => {
    assert.equal(sumHoras([{ horas: 10 }, { horas: '5' }]), 15);
});

test('sumHoras sobre una lista vacia es 0, no NaN', () => {
    const t = sumHoras([]);
    assert.equal(Number.isNaN(t), false);
    assert.equal(t, 0);
});

test('desgloseHoras acumula cada componente por separado', () => {
    const d = desgloseHoras([
        { horas: horasGps(6, 12, 3) },
        { horas: horasGps(2, 4, 1) }
    ]);
    assert.equal(d.ralenti, 8);
    assert.equal(d.movimiento, 16);
    assert.equal(d.parado, 4);
    assert.equal(d.total, 28);
    assert.equal(d.total, d.ralenti + d.movimiento + d.parado);
});

test('desgloseHoras arrastra el total guardado: no lo recalcula desde las partes', () => {
    // Contrato deliberado — `total` lo fija aggregateHours() al importar y acá se suma tal
    // cual. Si un registro llegara con las partes pero sin `total`, la igualdad
    // total = ralenti + movimiento + parado NO se sostiene. Queda escrito para que se vea:
    // la igualdad la garantiza el import, no esta funcion.
    const d = desgloseHoras([{ horas: { ralenti: 6, movimiento: 12, parado: 3 } }]);
    assert.equal(d.ralenti, 6);
    assert.equal(d.total, 0, 'sin `total` en el registro, el total sale 0');
});

test('desgloseHoras cuenta como movimiento un GPS con horas sueltas', () => {
    const d = desgloseHoras([{ horas: 10 }]);
    assert.equal(d.movimiento, 10);
    assert.equal(d.total, 10);
});

test('desgloseHoras sobre una lista vacia devuelve ceros', () => {
    const d = desgloseHoras([]);
    assert.equal(d.total, 0);
    assert.equal(Number.isNaN(d.ralenti), false);
});

// --- registros vacios ---------------------------------------------------------------------------

test('registroVacio descarta una carga sin litros ni importe', () => {
    assert.equal(registroVacio({ type: 'carga', litros: 0, importe: 0 }), true);
    assert.equal(registroVacio({ type: 'carga', litros: 100, importe: 0 }), false,
        'litros sin importe sigue siendo una carga real');
});

test('registroVacio descarta un GPS sin km ni horas', () => {
    assert.equal(registroVacio({ type: 'gps', distancia: 0, horas: horasGps(0, 0) }), true);
    assert.equal(registroVacio({ type: 'gps', distancia: 0, horas: horasGps(0, 5) }), false,
        'horas sin km es actividad real — un equipo estacionario');
    assert.equal(registroVacio({ type: 'gps', distancia: 500, horas: horasGps(0, 0) }), false);
});

test('registroVacio no descarta un registro de tipo desconocido', () => {
    // Conservador a proposito: lo que no se entiende no se tira.
    assert.equal(registroVacio({}), false);
    assert.equal(registroVacio({ type: 'otros' }), false);
    assert.equal(registroVacio(null), false);
});

// --- periodosDisponibles ------------------------------------------------------------------------

test('periodosDisponibles lista cada mes una sola vez y ordenado', () => {
    const p = periodosDisponibles([
        carga('2026-02-10'), carga('2026-01-10'), carga('2026-01-20')
    ]);
    assert.deepEqual(p.periodos, ['2026-01', '2026-02']);
});

test('periodosDisponibles ofrece los siete meses de un GPS Ene-Jul, no solo enero', () => {
    // Si el selector solo ofreciera enero no habria forma de elegir el rango que ese archivo mide.
    const p = periodosDisponibles([{ fecha: '2026-01-01', fecha_hasta: '2026-07-31' }]);
    assert.equal(p.periodos.length, 7);
    assert.equal(p.periodos[0], '2026-01');
    assert.equal(p.periodos[6], '2026-07');
});

test('periodosDisponibles sobre una lista vacia devuelve listas vacias', () => {
    assert.deepEqual(periodosDisponibles([]), { anios: [], meses: [], periodos: [] });
});
