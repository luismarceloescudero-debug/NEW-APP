/**
 * La unica funcion del proyecto que RECOMPONE PLATA.
 *
 * El caso real (fila 4747 de Cargas_Combustible_HSV_2026.xlsx, encontrado el 23/09/2026 por
 * `npm run unidades`): la misma celda traia el mismo numero en FECHA, DMA y COSTO TOTAL —
 * 46281.43541666667, el serial de fecha-hora de Excel del 16/09/2026. Alguien arrastro la fecha
 * sobre la celda de costo. El importe real de esa carga es 197 L x 2.400 = 472.800, asi que
 * contarlo tal cual metia un gasto falso de 46.281 Y escondia 426.518 pesos reales.
 *
 * Por que 46.281 no se delata solo: los importes legitimos de la planilla van de 2.914 a
 * 1.375.494, y hay 28 que caen dentro del rango de seriales de fecha. Por eso la condicion de
 * disparo es estricta a proposito — coincidencia EXACTA con la celda de fecha de la propia
 * fila, mas litros y precio disponibles. Ese umbral es justo lo que un unit test tiene que
 * congelar: aflojarlo convierte importes buenos en "recompuestos".
 *
 * Hasta ahora esto solo lo cubria `npm run unidades`, que necesita los Excel reales y por eso
 * no corre en CI.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { importeDeCarga } from '../js/parsers/xlsx-parser.js';

const SERIAL_4747 = 46281.43541666667;   // 16/09/2026 10:27 como serial de Excel
const fila = (costo) => ({ 'COSTO TOTAL ($)': costo });

test('recompone el importe cuando la celda de costo trae la fecha de su propia fila', () => {
    const r = importeDeCarga(fila(SERIAL_4747), SERIAL_4747, 197, 2400);
    assert.equal(r.importe, 472800, 'litros x precio');
    assert.equal(r._importe_original, SERIAL_4747, 'nunca se pierde el dato original');
    assert.match(r._importe_recompuesto, /fecha/i, 'y queda el motivo escrito');
});

test('no toca un importe legitimo que cae dentro del rango de seriales de fecha', () => {
    // Hay 28 asi en la planilla real. Si se dispararan, se estaria inventando plata.
    const r = importeDeCarga(fila(46000), SERIAL_4747, 197, 2400);
    assert.equal(r.importe, 46000);
    assert.equal('_importe_original' in r, false, 'no deberia recomponer nada');
});

test('la coincidencia tiene que ser exacta: un peso de diferencia ya no dispara', () => {
    const r = importeDeCarga(fila(SERIAL_4747 + 1), SERIAL_4747, 197, 2400);
    assert.equal(r.importe, SERIAL_4747 + 1);
    assert.equal('_importe_recompuesto' in r, false);
});

test('sin litros o sin precio no se recompone: no habria con que', () => {
    // La regla del proyecto es no auto-corregir plata. La excepcion se justifica solo porque
    // litros x precio da el importe real sin ambiguedad; sin esos dos, no hay excepcion.
    for (const [litros, precio] of [[0, 2400], [197, 0], [0, 0], [-197, 2400]]) {
        const r = importeDeCarga(fila(SERIAL_4747), SERIAL_4747, litros, precio);
        assert.equal(r.importe, SERIAL_4747, `litros=${litros} precio=${precio}`);
        assert.equal('_importe_recompuesto' in r, false);
    }
});

test('una fecha que no es serial de Excel nunca dispara la recomposicion', () => {
    // Si FECHA vino como texto ("16/09/2026"), no hay numero contra el cual comparar.
    for (const fechaVal of ['16/09/2026', '2026-09-16', null, undefined, '']) {
        const r = importeDeCarga(fila(472800), fechaVal, 197, 2400);
        assert.equal(r.importe, 472800);
        assert.equal('_importe_recompuesto' in r, false);
    }
});

test('un importe ausente o vacio queda en 0, sin recomponer', () => {
    const r = importeDeCarga({}, SERIAL_4747, 197, 2400);
    assert.equal(r.importe, 0);
    assert.equal('_importe_recompuesto' in r, false);
});

test('respeta el mapeo de columnas de la Fase 7', () => {
    // Cuando el usuario confirma en la vista previa que el costo es otra columna, se usa esa.
    const r = importeDeCarga(
        { 'TOTAL FACTURADO': SERIAL_4747, 'COSTO TOTAL ($)': 999 },
        SERIAL_4747, 197, 2400, { importe: 'TOTAL FACTURADO' }
    );
    assert.equal(r.importe, 472800);
    assert.equal(r._importe_original, SERIAL_4747);
});
