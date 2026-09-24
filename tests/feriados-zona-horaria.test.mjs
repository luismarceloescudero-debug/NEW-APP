/**
 * Un dia habil es un dia del CALENDARIO, no un instante: no puede depender de donde esta
 * parada la maquina que corre el calculo.
 *
 * El bug que motivo este archivo (encontrado el 24/09/2026 por esta misma suite): diasHabiles()
 * armaba el dia con `cur.toISOString()` — que es UTC — mientras construia `cur` en hora local.
 * Al este de UTC eso corre el string un dia para atras, asi que el chequeo de feriado se hacia
 * sobre el dia anterior. Medido antes del fix: la semana del 1 al 7 de junio de 2026 daba 5
 * dias habiles en Buenos Aires, UTC y Los Angeles, y 4 en Madrid, Tokio y Auckland.
 *
 * Por que un subproceso y no TZ a secas: Node fija la zona horaria al arrancar. Cambiar
 * process.env.TZ dentro de un test que ya importo Date no tiene ningun efecto — el test daria
 * verde sin probar nada. Cada zona necesita su propio proceso.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

// Dos al este de UTC (donde aparecia el bug), UTC, y una al oeste.
const ZONAS = ['America/Argentina/Buenos_Aires', 'UTC', 'Europe/Madrid', 'Pacific/Auckland'];

/**
 * Corre `expr` en un proceso nuevo con la zona horaria `tz` y devuelve su resultado parseado.
 *
 * `expr` DEBE ser siempre un literal escrito en este archivo. Nunca parametrizarlo desde un
 * fixture, un JSON, argv o env: eso convierte este `--eval` de "ejecutar código propio" en
 * "ejecutar datos de afuera", que es otra cosa. Mientras sea literal, `execFileSync` con los
 * argumentos en un array y sin `shell` no deja ninguna superficie de inyección.
 *
 * El `timeout` no es decoración: si `diasHabiles()` alguna vez entrara en un bucle que no
 * avanza, sin él estos siete procesos se cuelgan para siempre y el job de CI se come el tope
 * de la plataforma en vez de fallar en segundos.
 */
function enZona(tz, expr) {
    const codigo = `
        import { diasHabiles, esDiaHabil, ultimoDiaHabilDelMes } from './js/data/feriados.js';
        const r = ${expr};
        process.stdout.write(JSON.stringify(r));
    `;
    const salida = execFileSync(process.execPath, ['--input-type=module', '--eval', codigo], {
        cwd: RAIZ, encoding: 'utf8', env: { ...process.env, TZ: tz },
        timeout: 30_000, maxBuffer: 1 << 20, killSignal: 'SIGKILL'
    });
    return JSON.parse(salida);
}

/** Comprueba que `expr` da el mismo resultado en todas las zonas, y cual es ese resultado. */
function igualEnTodasLasZonas(expr, esperado) {
    const porZona = ZONAS.map(tz => [tz, enZona(tz, expr)]);
    for (const [tz, valor] of porZona) {
        assert.deepEqual(valor, esperado, `${tz} dio ${JSON.stringify(valor)} para ${expr}`);
    }
}

test('la zona horaria del proceso realmente cambia (si no, este archivo no prueba nada)', () => {
    // Guarda contra el falso verde: si Node ignorara TZ, todas las zonas serian la misma y
    // los tests de abajo pasarian sin ejercitar el caso que importa.
    const zonas = new Set(ZONAS.map(tz => enZona(tz,
        `Intl.DateTimeFormat().resolvedOptions().timeZone`)));
    assert.equal(zonas.size, ZONAS.length, `TZ no tuvo efecto: ${[...zonas]}`);
});

test('una semana corriente cuenta los mismos dias habiles en cualquier zona', () => {
    // Lunes 1 a domingo 7 de junio de 2026: 5 habiles, 1 sabado, 7 corridos.
    igualEnTodasLasZonas(
        `(({dias,sabados,totalCorridos}) => ({dias,sabados,totalCorridos}))(diasHabiles('2026-06-01','2026-06-07'))`,
        { dias: 5, sabados: 1, totalCorridos: 7 }
    );
});

test('un feriado en dia de semana se descuenta en cualquier zona', () => {
    // 9 de julio de 2026 (Independencia) cae jueves.
    igualEnTodasLasZonas(`diasHabiles('2026-07-09','2026-07-09').dias`, 0);
    igualEnTodasLasZonas(`diasHabiles('2026-07-06','2026-07-12').dias`, 4);
});

test('un sabado feriado no cuenta como sabado en ninguna zona', () => {
    // 20 de junio de 2026 es sabado Y Dia de la Bandera.
    igualEnTodasLasZonas(`diasHabiles('2026-06-20','2026-06-20').sabados`, 0);
    igualEnTodasLasZonas(`diasHabiles('2026-06-15','2026-06-21').sabados`, 0);
});

test('el primer y el ultimo dia del rango entran igual en cualquier zona', () => {
    // Los bordes son donde un corrimiento de un dia se nota primero.
    igualEnTodasLasZonas(`diasHabiles('2026-06-01','2026-06-01').totalCorridos`, 1);
    igualEnTodasLasZonas(`diasHabiles('2026-06-01','2026-06-30').totalCorridos`, 30);
});

test('un mes entero cuenta los mismos dias habiles en cualquier zona', () => {
    // Mayo 2026: 21 dias lun-vie menos el 1 (Trabajador, viernes) y el 25 (Revolucion de
    // Mayo, lunes) = 19 habiles, mas 5 sabados, ninguno feriado.
    igualEnTodasLasZonas(
        `(({dias,sabados}) => ({dias,sabados}))(diasHabiles('2026-05-01','2026-05-31'))`,
        { dias: 19, sabados: 5 }
    );
});

test('esDiaHabil y ultimoDiaHabilDelMes ya eran estables, y siguen estandolo', () => {
    // No usan toISOString(): trabajan sobre el string. Quedan fijados para que no cambie.
    igualEnTodasLasZonas(`esDiaHabil('2026-05-30')`, false);
    igualEnTodasLasZonas(`esDiaHabil('2026-06-01')`, true);
    igualEnTodasLasZonas(`ultimoDiaHabilDelMes('2026-05')`, '2026-05-29');
});
