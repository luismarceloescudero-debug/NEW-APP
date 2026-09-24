/**
 * El calculo que la app publica: consumo real, desvio contra la meta y exceso en litros y plata.
 *
 * Por que existe este archivo: un mutation testing del 24/09/2026 sobre los siete modulos mostro
 * que las tres invariantes de CLAUDE.md, en los dos lugares donde se aplican de verdad
 * —calculateMetrics() y calcularExceso()—, estaban protegidas UNICAMENTE por `npm run auditar`:
 * el arnes que tarda minutos, necesita los Excel reales y NO corre en CI. O sea que un cambio
 * podia pasar el CI en verde rompiendo la invariante 1.
 *
 * Seis mutaciones sobrevivian a `npm test` sobre los dos numeros que la app publica:
 *   - el factor 100 del L/100Km cambiado a 10
 *   - el ratio calculado sobre los totales en vez de la base alineada (invariante 1)
 *   - total_litros recortado a la base alineada (invariante 1b)
 *   - el signo de desvio_pct invertido
 *   - el signo de exceso_litros invertido
 *   - calcularExceso midiendo sobre total_litros en vez de litros_alineados (invariante 1)
 *
 * Las dos funciones son puras y reciben arrays: no hacen falta ni Excel ni IndexedDB.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateMetrics, determineConsumptionType } from '../js/data/analyzer.js';
import { calcularExceso } from '../js/data/diagnostico.js';

// --- fixtures -------------------------------------------------------------------------------

const TRACTOR = { interno: 'TR20', tipo: 'TRACTOR' };   // prefijo TR -> L/100Km
const MIXER = { interno: 'MX108', tipo: 'MIXER' };      // prefijo MX -> L/Hora
const ACOPLADO = { interno: 'TO01', tipo: 'ACOPLADO' }; // prefijo TO, sin tanque -> No Aplica

const carga = (fecha, litros, importe = litros * 1000) => ({ fecha, litros, importe });
const gpsKm = (ym, distancia, dias = 31) => ({
    fecha: `${ym}-01`, fecha_hasta: `${ym}-${String(dias).padStart(2, '0')}`, distancia
});
const gpsHs = (ym, horas, dias = 31) => ({
    fecha: `${ym}-01`, fecha_hasta: `${ym}-${String(dias).padStart(2, '0')}`, distancia: 0,
    horas: { ralenti: 0, movimiento: horas, parado: 0, total: horas }
});

// --- determineConsumptionType: la precedencia es una decision cerrada -------------------------

test('el tipo de calculo respeta la precedencia manual > unidad declarada > prefijo', () => {
    // El prefijo es el ultimo recurso. La unidad de Consumos Estimados es el dato mas valioso
    // de esa planilla: define si el equipo se mide por hora o por distancia.
    assert.equal(determineConsumptionType(TRACTOR), 'L/100Km', 'por prefijo');
    assert.equal(
        determineConsumptionType(TRACTOR, [], { unidad: 'L/Hora', valor: 3 }),
        'L/Hora', 'la unidad declarada le gana al prefijo'
    );
    assert.equal(
        determineConsumptionType({ ...TRACTOR, tipo_calculo_manual: 'L/Hora' }, [], { unidad: 'L/100Km', valor: 9 }),
        'L/Hora', 'lo manual le gana a todo'
    );
});

test('un equipo sin tanque propio no se mide, y uno desconocido tampoco se adivina', () => {
    assert.equal(determineConsumptionType(ACOPLADO), 'No Aplica');
    assert.equal(determineConsumptionType({ interno: 'ZZ99' }), 'Sin clasificar');
    assert.equal(determineConsumptionType(null), 'Sin clasificar');
});

// --- el factor del L/100Km -------------------------------------------------------------------

test('L/100Km es litros sobre km por CIEN', () => {
    // 500 L / 5.000 km x 100 = 10 L/100Km. Con el factor en 10 daria 1 — un decimo del consumo
    // real de toda la flota, plausible y mal.
    const m = calculateMetrics(TRACTOR, [carga('2026-01-10', 500)], [gpsKm('2026-01', 5000)]);
    assert.equal(m.tipo_calculo, 'L/100Km');
    assert.equal(m.consumo_real, 10);
});

test('L/Hora es litros sobre horas, sin factor', () => {
    const m = calculateMetrics(MIXER, [carga('2026-01-10', 300)], [gpsHs('2026-01', 100)]);
    assert.equal(m.tipo_calculo, 'L/Hora');
    assert.equal(m.consumo_real, 3);
});

test('las horas de ralenti cuentan igual que las de movimiento: el motor consume', () => {
    const gps = {
        fecha: '2026-01-01', fecha_hasta: '2026-01-31', distancia: 0,
        horas: { ralenti: 40, movimiento: 60, parado: 0, total: 100 }
    };
    const m = calculateMetrics(MIXER, [carga('2026-01-10', 300)], [gps]);
    assert.equal(m.consumo_real, 3, '300 / (40 + 60)');
});

// --- INVARIANTE 1: el ratio sale de la base alineada ------------------------------------------

test('el consumo se calcula sobre los meses que tienen cargas Y GPS, no sobre los totales', () => {
    // Cargas ene-feb (500 + 500 = 1.000 L), GPS solo febrero (2.000 km).
    // Correcto:   500 L / 2.000 km x 100 = 25 L/100Km   (solo febrero, los dos lados)
    // Incorrecto: 1.000 L / 2.000 km x 100 = 50         (numerador de dos meses, denominador de uno)
    const m = calculateMetrics(
        TRACTOR,
        [carga('2026-01-10', 500), carga('2026-02-10', 500)],
        [gpsKm('2026-02', 2000, 28)]
    );
    assert.equal(m.consumo_real, 25, 'el doble seria usar litros de un mes que no tiene GPS');
    assert.equal(m.litros_alineados, 500);
    assert.equal(m.km_alineados, 2000);
});

test('lo mismo en L/Hora: el numerador y el denominador son del mismo mes', () => {
    const m = calculateMetrics(
        MIXER,
        [carga('2026-01-10', 300), carga('2026-02-10', 300)],
        [gpsHs('2026-02', 100, 28)]
    );
    assert.equal(m.consumo_real, 3, '300 / 100, no 600 / 100');
    assert.equal(m.horas_alineadas, 100);
});

// --- INVARIANTE 1b: los totales NO se recortan ------------------------------------------------

test('los totales del periodo son el gasto y la actividad reales, sin recortar', () => {
    // El equipo cargo esos litros aunque falte el GPS de enero: ese gasto tiene que seguir
    // contando en los KPI de la flota. Recortarlo a la base alineada hace que los litros de la
    // flota dejen de cerrar contra la planilla.
    const m = calculateMetrics(
        TRACTOR,
        [carga('2026-01-10', 500, 500000), carga('2026-02-10', 500, 500000)],
        [gpsKm('2026-01', 3000), gpsKm('2026-02', 2000, 28)]
    );
    assert.equal(m.total_litros, 1000, 'los dos meses');
    assert.equal(m.total_costo, 1000000);
    assert.equal(m.total_km, 5000);
});

test('total_litros no cambia aunque la alineacion deje meses afuera', () => {
    const conGpsCompleto = calculateMetrics(
        TRACTOR,
        [carga('2026-01-10', 500), carga('2026-02-10', 500)],
        [gpsKm('2026-01', 3000), gpsKm('2026-02', 2000, 28)]
    );
    const sinGpsDeEnero = calculateMetrics(
        TRACTOR,
        [carga('2026-01-10', 500), carga('2026-02-10', 500)],
        [gpsKm('2026-02', 2000, 28)]
    );
    assert.equal(conGpsCompleto.total_litros, 1000);
    assert.equal(sinGpsDeEnero.total_litros, 1000, 'los litros no dependen de que haya GPS');
    assert.equal(sinGpsDeEnero.litros_alineados, 500, 'pero la base del ratio si');
});

test('cuando los periodos estan alineados, la base coincide con los totales', () => {
    const m = calculateMetrics(
        TRACTOR,
        [carga('2026-01-10', 500), carga('2026-02-10', 500)],
        [gpsKm('2026-01', 3000), gpsKm('2026-02', 2000, 28)]
    );
    assert.equal(m.litros_alineados, m.total_litros);
    assert.equal(m.km_alineados, m.total_km);
});

// --- sin base comun no se publica un numero ----------------------------------------------------

test('cargas y GPS sin ningun mes en comun no producen un consumo, producen un motivo', () => {
    const m = calculateMetrics(TRACTOR, [carga('2026-01-10', 500)], [gpsKm('2026-05', 5000)]);
    assert.equal(m.consumo_real, 0, 'no se publica una razon sin base');
    assert.match(m.motivo_sin_calculo, /no comparten ningún mes/i);
});

test('sin cargas no hay consumo que medir', () => {
    const m = calculateMetrics(TRACTOR, [], [gpsKm('2026-01', 5000)]);
    assert.equal(m.consumo_real, 0);
    assert.match(m.motivo_sin_calculo, /[Ss]in cargas/);
});

test('un equipo remolcado no se mide, aunque tenga cargas cruzadas', () => {
    const m = calculateMetrics(ACOPLADO, [carga('2026-01-10', 500)], [gpsKm('2026-01', 5000)]);
    assert.equal(m.tipo_calculo, 'No Aplica');
    assert.equal(m.consumo_real, 0);
});

test('un mes cubierto a medias sale del ratio pero no de los totales', () => {
    const m = calculateMetrics(
        TRACTOR,
        [carga('2026-01-10', 500), carga('2026-02-10', 500)],
        [gpsKm('2026-01', 3000), gpsKm('2026-02', 2000, 28)],
        null, [], new Set(['2026-02'])
    );
    assert.equal(m.litros_alineados, 500, 'febrero sale de la base');
    assert.equal(m.km_alineados, 3000);
    assert.equal(m.total_litros, 1000, 'pero los litros reales siguen siendo 1.000');
});

// --- el signo del desvio -----------------------------------------------------------------------

test('consumir MAS que la meta da un desvio POSITIVO', () => {
    // 10 L/100Km reales contra una meta de 8: (10/8 - 1) x 100 = +25%.
    // Con el signo invertido, un equipo 25% por encima informaria -25% y pasaria por eficiente.
    const m = calculateMetrics(
        TRACTOR, [carga('2026-01-10', 500)], [gpsKm('2026-01', 5000)],
        { valor: 8, unidad: 'L/100Km' }
    );
    assert.equal(m.consumo_real, 10);
    assert.equal(m.desvio_pct, 25);
});

test('consumir MENOS que la meta da un desvio NEGATIVO', () => {
    const m = calculateMetrics(
        TRACTOR, [carga('2026-01-10', 400)], [gpsKm('2026-01', 5000)],
        { valor: 10, unidad: 'L/100Km' }
    );
    assert.equal(m.consumo_real, 8);
    // Tolerancia: (8/10 - 1) x 100 da -19,999999999999996 en coma flotante.
    assert.ok(Math.abs(m.desvio_pct - (-20)) < 1e-9, `desvio_pct fue ${m.desvio_pct}`);
    assert.ok(m.desvio_pct < 0, 'tiene que ser negativo');
});

test('sin meta no hay desvio: null, no cero', () => {
    // Cero seria "esta justo en la meta", que es una afirmacion distinta de "no hay meta".
    const m = calculateMetrics(TRACTOR, [carga('2026-01-10', 500)], [gpsKm('2026-01', 5000)]);
    assert.equal(m.desvio_pct, null);
});

// --- calcularExceso: signo, base y plata -------------------------------------------------------

const filaDe = (metrics, confirmed) => ({ metrics, confirmed });

const METRICS_BASE = {
    tipo_calculo: 'L/100Km', consumo_real: 10,
    total_litros: 1000, total_costo: 2000000, total_km: 10000,
    litros_alineados: 1000, km_alineados: 10000, horas_alineadas: 0, total_horas: 0,
    alineacion: { meses: ['2026-01', '2026-02'] }
};

test('consumir de mas da exceso POSITIVO, en litros y en plata', () => {
    // Meta 8 L/100Km sobre 10.000 km => esperados 800 L. Reales 1.000 => exceso 200 L.
    // Precio 2.000.000 / 1.000 = 2.000 $/L => 400.000 de exceso.
    const e = calcularExceso(filaDe(METRICS_BASE, { valor: 8 }));
    assert.equal(e.litros_esperados, 800);
    assert.equal(e.exceso_litros, 200, 'reales menos esperados, no al reves');
    assert.equal(e.precio_litro, 2000);
    assert.equal(e.exceso_costo, 400000);
});

test('consumir de menos da exceso NEGATIVO: es un ahorro, no un gasto', () => {
    const e = calcularExceso(filaDe(METRICS_BASE, { valor: 12 }));
    assert.equal(e.litros_esperados, 1200);
    assert.equal(e.exceso_litros, -200);
    assert.ok(e.exceso_costo < 0, `el ahorro tiene que ser negativo, fue ${e.exceso_costo}`);
});

test('INVARIANTE 1: el exceso se mide sobre la base alineada, no sobre los totales', () => {
    // Cargas por 1.000 L en el periodo, pero solo 600 L y 6.000 km tienen las dos fuentes.
    // Correcto:   esperados 8 x 6.000 / 100 = 480; exceso = 600 - 480 = 120 L
    // Incorrecto: comparar los 1.000 L totales contra esos 480 => 520 L de exceso inventado,
    //             porque 400 de esos litros son de un mes sin GPS que nadie midio.
    const e = calcularExceso(filaDe(
        { ...METRICS_BASE, litros_alineados: 600, km_alineados: 6000 }, { valor: 8 }
    ));
    assert.equal(e.litros_base, 600);
    assert.equal(e.actividad, 6000);
    assert.equal(e.litros_esperados, 480);
    assert.equal(e.exceso_litros, 120);
});

test('lo que queda fuera de la base se declara, no se esconde', () => {
    // Un numero que se calcula sobre menos datos de los que hay tiene que decirlo.
    const e = calcularExceso(filaDe(
        { ...METRICS_BASE, litros_alineados: 600, km_alineados: 6000 }, { valor: 8 }
    ));
    assert.equal(e.litros_periodo, 1000);
    assert.equal(e.litros_fuera_de_base, 400);
    assert.equal(e.base_alineada, true);
    assert.deepEqual(e.meses_base, ['2026-01', '2026-02']);
});

test('sin base alineada cae a los totales, y lo declara', () => {
    const e = calcularExceso(filaDe(
        { ...METRICS_BASE, litros_alineados: 0, km_alineados: 0 }, { valor: 8 }
    ));
    assert.equal(e.litros_base, 1000, 'cae a total_litros');
    assert.equal(e.actividad, 10000);
    assert.equal(e.base_alineada, false);
    assert.equal(e.litros_fuera_de_base, 0);
});

test('el exceso en L/Hora usa las horas, no los km', () => {
    const e = calcularExceso(filaDe({
        ...METRICS_BASE, tipo_calculo: 'L/Hora', consumo_real: 5,
        km_alineados: 0, total_km: 0, horas_alineadas: 200, total_horas: 200
    }, { valor: 4 }));
    assert.equal(e.unidad_actividad, 'hs');
    assert.equal(e.actividad, 200);
    assert.equal(e.litros_esperados, 800, 'meta x horas, sin dividir por 100');
    assert.equal(e.exceso_litros, 200);
});

test('calcularExceso devuelve null cuando no hay con que compararse', () => {
    for (const [caso, fila] of [
        ['sin meta', filaDe(METRICS_BASE, null)],
        ['meta en cero', filaDe(METRICS_BASE, { valor: 0 })],
        ['meta negativa', filaDe(METRICS_BASE, { valor: -5 })],
        ['sin consumo real', filaDe({ ...METRICS_BASE, consumo_real: 0 }, { valor: 8 })],
        ['sin actividad', filaDe({ ...METRICS_BASE, km_alineados: 0, total_km: 0 }, { valor: 8 })],
        ['tipo no medible', filaDe({ ...METRICS_BASE, tipo_calculo: 'No Aplica' }, { valor: 8 })]
    ]) {
        assert.equal(calcularExceso(fila), null, caso);
    }
});

test('el precio por litro sale del periodo completo, no de la base alineada', () => {
    // Es un promedio de PRECIO, no una tasa de consumo: no depende del tramo, y usar todas las
    // cargas lo hace mas estable.
    const e = calcularExceso(filaDe(
        { ...METRICS_BASE, litros_alineados: 600, km_alineados: 6000 }, { valor: 8 }
    ));
    assert.equal(e.precio_litro, 2000, '2.000.000 / 1.000 litros del periodo entero');
});
