/**
 * Criterios de lectura: mediana, ralenti por tipo de equipo y confiabilidad de una razon.
 *
 * Cubre la invariante 2 de CLAUDE.md ("una definicion por concepto" — la mediana escrita dos
 * veces ya produjo el mismo bug dos veces) y la invariante 3 ("un numero bajo necesita
 * contexto antes de ser una conclusion").
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    mediana, categoriaRalenti, esCamioneta, confiabilidad, diasHabilesDeMeses,
    huerfanoAporta, coberturaEquipo, utilizacion,
    MIN_CARGAS_CONFIABLE, COBERTURA_MINIMA_PCT, OPERA_ESTACIONARIO, ESPERA_OPERATIVA
} from '../js/data/diagnostico.js';

// --- mediana ------------------------------------------------------------------------------

test('mediana de una lista par promedia los dos centrales', () => {
    // El bug de la version inline: arr.sort()[Math.floor(n/2)] devolvia 3, el de arriba.
    assert.equal(mediana([1, 2, 3, 4]), 2.5);
    assert.equal(mediana([10, 20]), 15);
});

test('mediana de una lista impar es el central', () => {
    assert.equal(mediana([1, 2, 3]), 2);
    assert.equal(mediana([5]), 5);
});

test('mediana ordena numericamente, no como texto', () => {
    // El otro bug de arr.sort() sin comparador: ordena por string y 10 queda antes que 9.
    assert.equal(mediana([9, 10, 11]), 10);
    assert.equal(mediana([100, 9, 80]), 80);
});

test('mediana no altera el array que recibe', () => {
    const original = [3, 1, 2];
    mediana(original);
    assert.deepEqual(original, [3, 1, 2], 'sort() in place arruinaria al que llamo');
});

test('mediana de una lista vacia es 0, no NaN ni undefined', () => {
    assert.equal(mediana([]), 0);
});

// --- ralenti por tipo de equipo -------------------------------------------------------------

test('el ralenti de un equipo estacionario no es desperdicio: es su funcion', () => {
    // Prefijos escritos a mano a proposito: recorrer OPERA_ESTACIONARIO haria que sacar un
    // prefijo de la lista siguiera dando verde. EX (excavadoras) es el que mas se discute —
    // son equipos de trabajo estacionario, NO de desplazamiento.
    for (const interno of ['GE01', 'MT01', 'MH01', 'CL02', 'MC01', 'AE01', 'EX01']) {
        assert.equal(categoriaRalenti(interno), 'estacionario', `${interno} deberia ser estacionario`);
    }
});

test('mixers y bombas tienen espera operativa legitima, no desperdicio', () => {
    // Pasan tiempo detenidos con el motor en marcha esperando descargar o bombear en obra.
    assert.equal(categoriaRalenti('MX108'), 'espera');
    assert.equal(categoriaRalenti('BM09'), 'espera');
});

test('las tres categorias de ralenti son excluyentes y no dejan a nadie afuera', () => {
    const categorias = new Set(
        [...OPERA_ESTACIONARIO, ...ESPERA_OPERATIVA, 'TR', 'CM']
            .map(p => categoriaRalenti(`${p}01`))
    );
    assert.deepEqual([...categorias].sort(), ['desperdicio', 'espera', 'estacionario']);
    for (const p of OPERA_ESTACIONARIO) {
        assert.equal(ESPERA_OPERATIVA.includes(p), false, `${p} esta en las dos listas`);
    }
});

test('el resto de la flota si cuenta el ralenti como desperdicio', () => {
    assert.equal(categoriaRalenti('TR20'), 'desperdicio');
    assert.equal(categoriaRalenti('CM43'), 'desperdicio');
});

test('categoriaRalenti no rompe ante un interno vacio', () => {
    for (const v of ['', null, undefined]) assert.equal(categoriaRalenti(v), 'desperdicio');
});

test('esCamioneta separa las CM del resto del grupo desperdicio', () => {
    assert.equal(esCamioneta('CM43'), true);
    assert.equal(esCamioneta('TR20'), false);
    assert.equal(esCamioneta(''), false);
});

// --- confiabilidad: la invariante 3 ---------------------------------------------------------

const fila = (metrics, extra = {}) => ({
    metrics: {
        cantidad_cargas: 10, cantidad_gps: 6, total_litros: 1000,
        total_km: 5000, total_horas: 200, tipo_calculo: 'L/100Km', ...metrics
    },
    ...extra
});

test('confiabilidad no avisa nada cuando la base se sostiene', () => {
    const r = confiabilidad(fila({}));
    assert.equal(r.confiable, true);
    assert.deepEqual(r.avisos, []);
});

test('litros sin actividad medida no es "consume 0": es "no sabemos cuanto consume"', () => {
    // Antes esto salia como "0,00 L/100km" con cara de medicion, que es peor que no mostrar nada.
    const r = confiabilidad(fila({ total_km: 0, total_horas: 0, total_litros: 1000 }));
    assert.equal(r.sinActividad, true);
    assert.equal(r.confiable, false);
    assert.ok(r.avisos.some(a => a.includes('sin actividad medida')), r.avisos.join(' | '));
});

test('el umbral de pocas cargas esta en 3, con el numero escrito', () => {
    // Literal a proposito: escribirlo como MIN_CARGAS_CONFIABLE - 1 lo deriva de la constante,
    // asi que mover el umbral a 2 o a 5 dejaria el test en verde. Un umbral de negocio se fija
    // con el numero, y con los dos lados del corte.
    assert.equal(MIN_CARGAS_CONFIABLE, 3);

    const dos = confiabilidad(fila({ cantidad_cargas: 2 }));
    assert.equal(dos.confiable, false);
    assert.ok(dos.avisos.some(a => a.includes('2 cargas')), dos.avisos.join(' | '));

    const tres = confiabilidad(fila({ cantidad_cargas: 3 }));
    assert.equal(tres.avisos.some(a => a.includes('carga')), false,
        `3 cargas ya alcanza: ${tres.avisos.join(' | ')}`);
});

test('el umbral de cobertura minima esta en 40%, con el numero escrito', () => {
    assert.equal(COBERTURA_MINIMA_PCT, 40);

    // Junio 2026 tiene 22,5 dias habiles ponderados. 8 dias con carga = 36% (abajo del corte),
    // 10 = 44% (arriba). Una carga por dia distinto, sin cadencia regular que lo exima.
    const conDias = (n) => confiabilidad(
        fila({ cantidad_gps: 6 }, {
            cargas: Array.from({ length: n }, (_, i) =>
                ({ fecha: `2026-06-${String(i + 1).padStart(2, '0')}` }))
        }),
        { desde: '2026-06-01', hasta: '2026-06-30' }
    );

    const flojo = conDias(8);
    assert.equal(flojo.cobertura.pct, 36);
    assert.ok(flojo.avisos.some(a => a.includes('días hábiles')), flojo.avisos.join(' | '));

    const bueno = conDias(10);
    assert.equal(bueno.cobertura.pct, 44);
    assert.equal(bueno.avisos.some(a => a.includes('días hábiles')), false,
        `44% no deberia avisar: ${bueno.avisos.join(' | ')}`);
});

test('un solo periodo de GPS se avisa: no hay con que comparar', () => {
    const r = confiabilidad(fila({ cantidad_gps: 1 }));
    assert.equal(r.confiable, false);
    assert.ok(r.avisos.some(a => a.includes('un solo período de GPS')), r.avisos.join(' | '));
});

test('confiabilidad calcula cobertura solo cuando se le pasa un periodo y hay cargas', () => {
    const sinPeriodo = confiabilidad(fila({}));
    assert.equal(sinPeriodo.cobertura, null);

    const conPeriodo = confiabilidad(
        fila({}, { cargas: [{ fecha: '2026-06-01' }, { fecha: '2026-06-02' }] }),
        { desde: '2026-06-01', hasta: '2026-06-30' }
    );
    assert.ok(conPeriodo.cobertura, 'deberia venir el desglose de cobertura');
    assert.equal(conPeriodo.cobertura.diasConCarga, 2);
});

test('la cobertura no se recorta a 100%: pasarse es justamente lo que hay que detectar', () => {
    const cargas = Array.from({ length: 40 }, (_, i) =>
        ({ fecha: `2026-06-${String((i % 30) + 1).padStart(2, '0')}` }));
    const r = confiabilidad(
        fila({}, { cargas }),
        { desde: '2026-06-01', hasta: '2026-06-30' }
    );
    assert.ok(r.cobertura.pct > 100, `pct fue ${r.cobertura.pct}`);
});

// --- coberturaEquipo: dias distintos con carga, no cantidad de cargas ----------------------

const filaCobertura = (cargas, extra = {}) =>
    ({ metrics: { cantidad_cargas: cargas.length }, cargas, ...extra });

test('coberturaEquipo cuenta dias DISTINTOS con carga, no cantidad de cargas', () => {
    // Bug historico documentado en diagnostico.js: antes esta funcion contaba cargas y
    // confiabilidad() contaba dias, y la tarjeta mostraba "53 de 60" contra "46 de 60" para
    // el mismo equipo y el mismo periodo. Dos cargas el mismo dia (doble turno, carga parcial
    // y despues completa) tienen que seguir siendo UN dia de cobertura, no dos.
    const cargas = [
        { fecha: '2026-06-01' }, { fecha: '2026-06-01' },
        { fecha: '2026-06-02' }, { fecha: '2026-06-03' }
    ];
    const r = coberturaEquipo(filaCobertura(cargas), { desde: '2026-06-01', hasta: '2026-06-30' });
    assert.equal(r.diasConCarga, 3, 'dos cargas el mismo dia cuentan como un solo dia');
    assert.equal(r.cargas, 4, 'el campo cargas si refleja la cantidad, aparte de diasConCarga');
});

test('coberturaEquipo da el mismo 36% que confiabilidad() para el mismo caso: es la misma cuenta', () => {
    // Hoy las dos funciones cuentan dias, A PROPOSITO (ver comentario de coberturaEquipo). Si
    // alguna volviera a contar cargas, este test y "el umbral de cobertura minima..." de mas
    // arriba en este archivo se desalinearian.
    const cargas = Array.from({ length: 8 }, (_, i) =>
        ({ fecha: `2026-06-${String(i + 1).padStart(2, '0')}` }));
    const r = coberturaEquipo(filaCobertura(cargas), { desde: '2026-06-01', hasta: '2026-06-30' });
    assert.equal(r.diasConCarga, 8);
    assert.equal(r.diasPonderados, 22.5);
    assert.equal(r.diasTrabajados, 22.5);
    assert.equal(r.pct, 36);
    assert.equal(r.exceso, false);

    const cruzado = confiabilidad(
        fila({ cantidad_gps: 6 }, { cargas }), { desde: '2026-06-01', hasta: '2026-06-30' }
    );
    assert.equal(r.pct, cruzado.cobertura.pct, 'coberturaEquipo y confiabilidad deben leer el mismo %');
});

test('coberturaEquipo descuenta del denominador los rangos fuera de servicio', () => {
    // 15 al 19 de junio de 2026: lun a vie, sin sabado en el rango, y el 17 es feriado
    // (Gral. Guemes) -> 4 dias habiles ponderados que salen del denominador.
    const cargas = Array.from({ length: 8 }, (_, i) =>
        ({ fecha: `2026-06-${String(i + 1).padStart(2, '0')}` }));
    const r = coberturaEquipo(
        filaCobertura(cargas), { desde: '2026-06-01', hasta: '2026-06-30' },
        [{ desde: '2026-06-15', hasta: '2026-06-19' }]
    );
    assert.equal(r.diasFueraServicio, 4);
    assert.equal(r.diasTrabajados, 18.5);
    assert.equal(r.pct, 43);
});

test('coberturaEquipo no se recorta a 100%: pasarse es justamente lo que hay que poder detectar', () => {
    // Mismas 8 fechas, pero un periodo de un solo dia habil como denominador: el pct se dispara.
    const cargas = Array.from({ length: 8 }, (_, i) =>
        ({ fecha: `2026-06-${String(i + 1).padStart(2, '0')}` }));
    const r = coberturaEquipo(filaCobertura(cargas), { desde: '2026-06-01', hasta: '2026-06-01' });
    assert.ok(r.pct > 100, `pct fue ${r.pct}`);
    assert.equal(r.exceso, true);
});

test('coberturaEquipo devuelve null sin ninguna carga', () => {
    assert.equal(coberturaEquipo(filaCobertura([])), null);
});

test('coberturaEquipo usa el rango propio del equipo cuando no se le pasa un periodo de flota', () => {
    // Sin `periodo` explicito, el denominador sale de la union de fechas de cargas y GPS del
    // propio equipo (diagnostico.js:399-407) — no del periodo de toda la flota. Esta rama
    // quedaba sin ejercitar: el unico test anterior sin periodo cortaba antes, por 0 cargas.
    const cargas = [{ fecha: '2026-06-01' }, { fecha: '2026-06-05' }, { fecha: '2026-06-10' }];
    const gps = [{ fecha: '2026-06-15' }];
    const r = coberturaEquipo({ metrics: { cantidad_cargas: 3 }, cargas, gps });
    // Rango propio: 01/06 al 15/06/2026 (15 dias corridos, 11 habiles, 2 sabados).
    assert.equal(r.diasConCarga, 3);
    assert.equal(r.totalCorridos, 15);
    assert.equal(r.diasPonderados, 12);
    assert.equal(r.pct, 25);
});

test('coberturaEquipo devuelve null cuando el equipo no tiene ni dos fechas para armar un rango propio', () => {
    // Una sola fecha entre cargas y GPS no alcanza para tener un "desde" y un "hasta" propios.
    const r = coberturaEquipo({ metrics: { cantidad_cargas: 1 }, cargas: [{ fecha: '2026-06-01' }], gps: [] });
    assert.equal(r, null);
});

// --- utilizacion: horas de GPS por dia habil contra la jornada de referencia ----------------

const filaUtilizacion = (horasAlineadas, deno = 'MIXER') => ({
    equipo: { denominacion: deno },
    metrics: { horas_alineadas: horasAlineadas, alineacion: { meses: ['2026-06'] } }
});

test('utilizacion clasifica muy_baja por debajo del 60% del minimo de la jornada', () => {
    // Mixer, jornada de referencia 10-12 hs. 90 hs alineadas / 22,5 dias ponderados de junio
    // 2026 = 4 hs/dia. 4 < 10*0.6=6 -> muy_baja.
    const r = utilizacion(filaUtilizacion(90));
    assert.equal(r.hsPorDia, 4);
    assert.equal(r.estado, 'muy_baja');
});

test('utilizacion clasifica baja entre el 60% del minimo y el minimo', () => {
    const r = utilizacion(filaUtilizacion(157.5));
    assert.equal(r.hsPorDia, 7);
    assert.equal(r.estado, 'baja');
});

test('utilizacion clasifica normal dentro del rango de referencia', () => {
    const r = utilizacion(filaUtilizacion(225));
    assert.equal(r.hsPorDia, 10);
    assert.equal(r.estado, 'normal');
});

test('utilizacion clasifica alta por encima del 125% del maximo', () => {
    // 12*1.25 = 15: 16 hs/dia lo pasa.
    const r = utilizacion(filaUtilizacion(360));
    assert.equal(r.hsPorDia, 16);
    assert.equal(r.estado, 'alta');
});

test('utilizacion NO marca alta a un equipo apenas por encima del maximo, antes del margen del 125%', () => {
    // 13 hs/dia supera el maximo de la jornada (12) pero no llega al umbral de alta (12*1.25=15):
    // sigue siendo normal. Sin este caso, bajar el margen del 125% al 100% no se nota, porque
    // el caso de arriba (16 hs/dia) queda por encima de los dos umbrales igual.
    const r = utilizacion(filaUtilizacion(292.5));
    assert.equal(r.hsPorDia, 13);
    assert.equal(r.estado, 'normal');
});

test('utilizacion clasifica no_representativa por encima de 24 hs por dia: problema de dato', () => {
    // Mas de 24 hs por dia ponderado es un GPS reportando horas imposibles, no una jornada real.
    const r = utilizacion(filaUtilizacion(600));
    assert.ok(Math.abs(r.hsPorDia - 26.666666) < 0.001);
    assert.equal(r.estado, 'no_representativa');
});

test('utilizacion devuelve null cuando el equipo no sigue una jornada laboral', () => {
    // Un grupo electrogeno puede quedar encendido de corrido, incluido fin de semana: medirlo
    // en "horas por dia habil" da un numero imposible porque el numerador cuenta dias corridos
    // y el denominador solo los habiles. jornadaEsperada() corta antes de calcular nada.
    assert.equal(utilizacion(filaUtilizacion(200, 'GRUPO ELECTROGENO')), null);
});

test('utilizacion devuelve null sin horas para dividir', () => {
    const f = {
        equipo: { denominacion: 'MIXER' },
        metrics: { horas_alineadas: 0, total_horas: 0, alineacion: { meses: ['2026-06'] } }
    };
    assert.equal(utilizacion(f), null);
});

// --- dias habiles de un conjunto de meses ------------------------------------------------------

test('diasHabilesDeMeses cuenta un mes con los numeros del calendario', () => {
    // Junio 2026: 22 dias lun-vie menos el 17 (Guemes) = 21 habiles. 4 sabados, pero el 20 es
    // Dia de la Bandera, asi que quedan 3 -> ponderado 21 + 3*0,5 = 22,5.
    // Valores literales a proposito: con asserts solo relacionales (dos = uno + otro,
    // ponderado >= total) un stub que devuelve todo 0 los cumple y el test no prueba nada.
    assert.deepEqual(diasHabilesDeMeses(['2026-06']), { total: 21, ponderado: 22.5, sabados: 3 });
    assert.deepEqual(diasHabilesDeMeses(['2026-07']), { total: 22, ponderado: 24, sabados: 4 });
});

test('diasHabilesDeMeses suma mes por mes, sin contar de mas ni de menos', () => {
    assert.deepEqual(
        diasHabilesDeMeses(['2026-06', '2026-07']),
        { total: 43, ponderado: 46.5, sabados: 7 }
    );
});

test('diasHabilesDeMeses ignora un mes mal formado en vez de romper', () => {
    assert.deepEqual(
        diasHabilesDeMeses(['2026-06', 'x', '', null]),
        { total: 21, ponderado: 22.5, sabados: 3 }
    );
});

test('diasHabilesDeMeses de una lista vacia es cero', () => {
    assert.deepEqual(diasHabilesDeMeses([]), { total: 0, ponderado: 0, sabados: 0 });
});

// --- huerfanos que no aportan nada ---------------------------------------------------------------

test('un huerfano que no aporta litros ni km ni horas no es un equipo', () => {
    // MAQUILA, GENCO, MONTEVERDI: nombres de cliente u obra que Loop trae en sus filas.
    assert.equal(huerfanoAporta({ nombre: 'MAQUILA', litros: 0, km: 0, horas: 0 }), false);
    assert.equal(huerfanoAporta({}), false);
});

test('un huerfano que aporta cualquiera de las tres cosas si se revisa', () => {
    assert.equal(huerfanoAporta({ litros: 50 }), true);
    assert.equal(huerfanoAporta({ km: 100 }), true);
    assert.equal(huerfanoAporta({ horas: 8 }), true,
        'el caso PORTATIL: 0 litros pero 6.903 km y 3.180 h, invisible en los hallazgos');
});
