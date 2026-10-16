/**
 * Cargas que un equipo no pudo haber hecho (caso real CM43: 23 cargas en dos dias, 3.295 L, en
 * cinco lugares distintos, siendo una camioneta).
 *
 * Lo que se cuida es el falso positivo: marcar de mas una carga legitima manda a una persona a
 * revisar un comprobante por nada, y si pasa seguido se deja de mirar el hallazgo. Por eso cada
 * regla tiene su test de "no toca", y sobre todo el caso de las DOS sedes en un dia, que es
 * normal (una a la manana, otra a la tarde).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    cargasImposibles, porEquipo, litrosPorCargaPorDenominacion, referenciaDe,
    MAX_CARGAS_DIA, FACTOR_LITROS_DIA, MIN_CARGAS_DIA
} from '../js/data/cargas-imposibles.js';

const carga = (fecha, litros, lugar = 'GRIS', centro = 'AMZA') => ({ fecha, litros, lugar_carga: lugar, centro_costo: centro, importe: litros * 2400 });
const fila = (interno, denominacion, cargas) => ({ equipo: { interno, denominacion }, cargas });

/** Una flota de camionetas que cargan ~60 L por vez: la referencia medida de su denominacion. */
const camionetasNormales = () => [
    fila('CM09', 'CAMIONETA', [carga('2026-01-05', 60), carga('2026-02-05', 62), carga('2026-03-05', 58)]),
    fila('CM10', 'CAMIONETA', [carga('2026-01-06', 61), carga('2026-02-06', 59), carga('2026-03-06', 60)])
];

// --- la referencia por denominacion ----------------------------------------------------------

test('la referencia de un equipo EXCLUYE sus propias cargas', () => {
    // Es el punto del modulo: si la mediana se calculara con las cargas del propio equipo, las
    // malas correrian la referencia hacia arriba y se taparian a si mismas (el problema que
    // tiene el hallazgo `anomalas`).
    const filas = [
        fila('CM09', 'CAMIONETA', [carga('2026-01-05', 60), carga('2026-01-06', 60)]),
        fila('CM43', 'CAMIONETA', [carga('2026-09-17', 300), carga('2026-09-18', 300)])
    ];
    const ref = litrosPorCargaPorDenominacion(filas).get('CAMIONETA');
    assert.equal(ref.get('CM43'), 60, 'a CM43 lo mide CM09, no sus propios 300 L');
    assert.equal(ref.get('CM09'), 300, 'y a CM09 lo mide CM43');
});

test('un equipo unico en su denominacion queda sin referencia, no con la suya propia', () => {
    const ref = litrosPorCargaPorDenominacion([fila('XX01', 'MAQUINA RARA', [carga('2026-01-05', 300)])]);
    assert.equal(ref.get('MAQUINA RARA').has('XX01'), false);
    assert.equal(referenciaDe([fila('XX01', 'MAQUINA RARA', [carga('2026-01-05', 300)])], 'XX01'), 0);
});

test('las cargas en cero no ensucian la mediana', () => {
    const filas = [
        fila('CM09', 'CAMIONETA', [carga('2026-01-05', 0), carga('2026-01-06', 60), carga('2026-01-07', 60)]),
        fila('CM43', 'CAMIONETA', [carga('2026-02-01', 100)])
    ];
    assert.equal(litrosPorCargaPorDenominacion(filas).get('CAMIONETA').get('CM43'), 60);
});

// --- senal geografica ------------------------------------------------------------------------

test('mas de tres cargas en un dia es imposible', () => {
    // Medido: de 4.641 equipo-dias reales, ninguno pasa de 3 cargas salvo los dos casos malos.
    const filas = [...camionetasNormales(), fila('CM43', 'CAMIONETA', [
        carga('2026-09-17', 10), carga('2026-09-17', 10), carga('2026-09-17', 10), carga('2026-09-17', 10)
    ])];
    const r = cargasImposibles(filas);
    assert.equal(r.length, 1);
    assert.equal(r[0].cargas, 4);
    assert.ok(r[0].motivos.some(m => /4 cargas en un solo d/.test(m)), JSON.stringify(r[0].motivos));
});

test('TRES cargas en un dia es legitimo: es el maximo real de la flota', () => {
    // Mixers y tractores llegan a 3 en dias normales (1.992 y 1.158 dias observados). Marcar 3
    // llenaria el hallazgo de ruido y es el falso positivo que mas importa evitar.
    assert.equal(MAX_CARGAS_DIA, 3, 'el umbral es "mas de 3"');
    const filas = [...camionetasNormales(), fila('MX62', 'MIXER', [
        carga('2026-06-17', 10), carga('2026-06-17', 10), carga('2026-06-17', 10)
    ]), fila('MX63', 'MIXER', [carga('2026-06-18', 10)])];
    assert.deepEqual(cargasImposibles(filas), []);
});

test('el lugar de carga NO decide nada: tres sedes en un dia con pocas cargas no se marca', () => {
    // La version anterior sumaba una senal geografica y marcaba a TR32 por cargar en GRIS,
    // EE SS CORONEL DIAZ y TUNUYAN. Juzgar un recorrido exige saber la distancia entre dos
    // puntos, y la planilla no la dice: se saco la senal y solo quedan equipo, litros y fecha.
    const filas = [...camionetasNormales(), fila('TR32', 'TRACTOR C/CABINA', [
        carga('2026-04-29', 55, 'GRIS'), carga('2026-04-29', 55, 'EE SS CORONEL DIAZ'), carga('2026-04-29', 55, 'TUNUYAN')
    ]), fila('TR33', 'TRACTOR C/CABINA', [carga('2026-04-28', 55)])];
    assert.deepEqual(cargasImposibles(filas), []);
});

test('las cargas del dia se cuentan por FECHA, no por el total del equipo', () => {
    // Cuatro cargas repartidas en cuatro dias son normales; cuatro en un dia no.
    const repartidas = [...camionetasNormales(), fila('CM43', 'CAMIONETA', [
        carga('2026-09-14', 10), carga('2026-09-15', 10), carga('2026-09-16', 10), carga('2026-09-17', 10)
    ])];
    assert.deepEqual(cargasImposibles(repartidas), []);
});

test('el mismo lugar escrito con otra caja o espacios no cuenta como lugar distinto', () => {
    const filas = [...camionetasNormales(), fila('CM43', 'CAMIONETA', [
        carga('2026-09-17', 50, 'gris'), carga('2026-09-17', 50, ' GRIS '), carga('2026-09-17', 50, 'Gris')
    ])];
    assert.deepEqual(cargasImposibles(filas), []);
});

test('tres sedes en DIAS distintos no es imposible', () => {
    const filas = [...camionetasNormales(), fila('CM43', 'CAMIONETA', [
        carga('2026-09-15', 50, 'GRIS'), carga('2026-09-16', 50, 'TUNUYAN'), carga('2026-09-17', 50, 'SAN MARTIN')
    ])];
    assert.deepEqual(cargasImposibles(filas), []);
});

// --- senal volumetrica -----------------------------------------------------------------------

test('mas de cinco tanques de su tipo en un dia es imposible', () => {
    // 60 L es la mediana de la denominacion; 6 cargas de 60 = 360 L = 6 veces.
    const filas = [...camionetasNormales(), fila('CM43', 'CAMIONETA',
        Array.from({ length: 6 }, () => carga('2026-09-17', 60)))];
    const r = cargasImposibles(filas);
    assert.equal(r.length, 1);
    assert.ok(r[0].motivos.some(m => /veces lo que carga por vez/.test(m)), JSON.stringify(r[0].motivos));
    assert.equal(r[0].veces, 6);
});

test('justo en el factor no alcanza: el umbral es estricto', () => {
    // Con 3 cargas (el maximo legitimo) para que no se mezcle la senal de cantidad: 300 L contra
    // una referencia de 60 L por carga es exactamente 5 veces, y 5 veces no alcanza.
    const filas = [...camionetasNormales(), fila('CM43', 'CAMIONETA', [
        carga('2026-09-17', 100), carga('2026-09-17', 100), carga('2026-09-17', 100)
    ])];
    assert.equal(FACTOR_LITROS_DIA, 5);
    assert.deepEqual(cargasImposibles(filas), []);
});

test('sin referencia de su denominacion no se juzga el volumen', () => {
    // Un equipo solo en su tipo: su propia mediana seria la referencia, que es justo lo que este
    // modulo NO usa. Sin pares medidos se calla en vez de inventar un tope. Con 3 cargas para no
    // mezclar la senal de cantidad, que no depende de los pares.
    const filas = [fila('XX01', 'MAQUINA RARA', [
        carga('2026-09-17', 300), carga('2026-09-17', 300), carga('2026-09-17', 300)
    ])];
    assert.deepEqual(cargasImposibles(filas), []);
});

test('sin pares, la cantidad de cargas SI se juzga: no depende de la referencia', () => {
    // Cuantas veces puede cargar un equipo en un dia no se mide contra sus pares sino contra lo
    // que es fisicamente posible, asi que un equipo unico en su tipo igual se marca.
    const filas = [fila('XX01', 'MAQUINA RARA', Array.from({ length: 8 }, (_, i) => carga('2026-09-17', 300)))];
    const r = cargasImposibles(filas);
    assert.equal(r.length, 1);
    assert.deepEqual(r[0].motivos.length, 1, 'solo la de cantidad: sin pares no hay juicio de volumen');
    assert.equal(r[0].ref_litros_carga, 0);
});

// --- el caso real que lo motivo --------------------------------------------------------------

test('el caso CM43: 23 cargas en dos dias, cinco lugares, se marca por las dos senales', () => {
    const lugares = ['GRIS', 'ARIDOS', 'SAN MARTIN', 'TUNUYAN', 'GODOY CRUZ'];
    const cargas = [];
    for (let i = 0; i < 17; i++) cargas.push(carga('2026-09-17', 120, lugares[i % 5]));
    for (let i = 0; i < 6; i++) cargas.push(carga('2026-09-16', 200, lugares[i % 5]));
    // mas las cargas normales de ene-jul, que son las que corrian su propia mediana
    for (const m of ['01', '02', '03', '04', '05', '06', '07']) cargas.push(carga(`2026-${m}-10`, 60));
    const r = cargasImposibles([...camionetasNormales(), fila('CM43', 'CAMIONETA', cargas)]);
    assert.equal(r.length, 2, 'un caso por dia');
    for (const caso of r) {
        assert.equal(caso.interno, 'CM43');
        assert.equal(caso.motivos.length, 2, 'las dos senales: cantidad de cargas y litros del dia');
    }
    // el dia mas grave primero
    assert.equal(r[0].dia, '2026-09-17');
    assert.equal(r[0].cargas, 17);
});

test('una sola carga en el dia no se juzga', () => {
    assert.equal(MIN_CARGAS_DIA, 2);
    const filas = [...camionetasNormales(), fila('CM43', 'CAMIONETA', [carga('2026-09-17', 500)])];
    assert.deepEqual(cargasImposibles(filas), []);
});

test('una flota normal no genera ningun caso', () => {
    assert.deepEqual(cargasImposibles(camionetasNormales()), []);
});

test('sin fecha la carga no se puede agrupar por dia', () => {
    const filas = [...camionetasNormales(), fila('CM43', 'CAMIONETA', [
        carga('', 300, 'GRIS'), carga('', 300, 'ARIDOS'), carga('', 300, 'TUNUYAN')
    ])];
    assert.deepEqual(cargasImposibles(filas), []);
});

// --- agrupado por equipo ---------------------------------------------------------------------

test('porEquipo junta los dias del mismo equipo en una sola linea', () => {
    const cargas = [];
    for (let i = 0; i < 4; i++) cargas.push(carga('2026-09-17', 100));
    for (let i = 0; i < 4; i++) cargas.push(carga('2026-09-16', 100));
    const r = porEquipo(cargasImposibles([...camionetasNormales(), fila('CM43', 'CAMIONETA', cargas)]));
    assert.equal(r.length, 1);
    assert.deepEqual(r[0].dias, ['2026-09-16', '2026-09-17']);
    assert.equal(r[0].cargas, 8);
    assert.equal(r[0].litros, 800);
    assert.equal(r[0].max_carga, 100);
});

test('porEquipo sin casos devuelve una lista vacia', () => {
    assert.deepEqual(porEquipo([]), []);
});
