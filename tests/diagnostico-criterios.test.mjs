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
    huerfanoAporta, MIN_CARGAS_CONFIABLE, COBERTURA_MINIMA_PCT, OPERA_ESTACIONARIO, ESPERA_OPERATIVA
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
