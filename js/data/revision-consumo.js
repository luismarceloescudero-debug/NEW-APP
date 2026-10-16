/**
 * Consumos altos, bajos y esporádicos que quedan marcados para revisar más adelante.
 *
 * El problema que resuelve: hoy un consumo raro se ve en el panel del período que se está
 * mirando y se pierde. Nadie sabe, dos meses después, si ese equipo que consumía de más sigue
 * igual, si se normalizó, o si en realidad estuvo en el taller y por eso el número daba raro.
 * Marcar el consumo guarda una FOTO del número y de su base; cuando llegan meses nuevos, la
 * revisión se vuelve a evaluar sola contra los datos y contra los estados anotados del equipo.
 *
 * Módulo puro (sin DOM ni base de datos): la foto se guarda en el store `revisionesConsumo`
 * (database.js) y la UI está en panel.js.
 *
 * Por qué un estado "explica" el consumo pero no lo cierra: un equipo parado medio período
 * carga poco (consumo bajo) pero también acumula pocas horas, así que su L/hora puede salir
 * ALTO. El estado no determina el signo del desvío — da el contexto que faltaba. Así que la
 * revisión informa el solapamiento y deja la conclusión a quien la lee, en vez de afirmar una
 * causa que no midió (invariante 3: un número raro necesita contexto antes de ser conclusión).
 */
import { normalizeEquipoKey } from './normalizer.js';
import { TOLERANCIA_DESVIO, cadenciaCargas } from './diagnostico.js';

/** Los tres patrones que se pueden marcar. El `label` es el que ve la persona. */
export const PATRONES_CONSUMO = [
    { id: 'alto', label: 'Consumo alto', descripcion: `consume más de ${Math.round(TOLERANCIA_DESVIO * 100)}% por encima de su meta` },
    { id: 'bajo', label: 'Consumo bajo', descripcion: `consume más de ${Math.round(TOLERANCIA_DESVIO * 100)}% por debajo de su meta` },
    { id: 'esporadico', label: 'Consumo esporádico', descripcion: 'carga de forma irregular: no hay un patrón mensual que sostener' }
];

export const PATRON_LABEL = Object.fromEntries(PATRONES_CONSUMO.map(p => [p.id, p.label]));

/** Estados del equipo que dan contexto a un consumo raro (ver estados-equipo.js y planta.js). */
export const ESTADOS_QUE_EXPLICAN = ['fuera_servicio', 'traslado_sj', 'taller_ext', 'taller_int', 'vendido', 'temporada_baja', 'sin_chofer', 'backup'];

/**
 * Qué patrones presenta HOY un equipo. Se usa al re-evaluar una revisión: si el patrón que se
 * marcó ya no está en esta lista, el consumo se normalizó.
 *
 * Los umbrales no se eligen acá: `alto` y `bajo` salen de la misma tolerancia que usan los
 * hallazgos de sobreconsumo y ahorro, y `esporadico` de la misma cadencia que decide si un
 * equipo tiene patrón mensual. Escribir un segundo umbral "parecido" es justo lo que la
 * invariante 2 prohíbe: dos números distintos para el mismo concepto.
 */
export function patronesDe(fila, periodo = null) {
    const patrones = [];
    const desvio = fila?.metrics?.desvio_pct;
    if (desvio !== null && desvio !== undefined) {
        if (desvio > TOLERANCIA_DESVIO * 100) patrones.push('alto');
        if (desvio < -TOLERANCIA_DESVIO * 100) patrones.push('bajo');
    }
    const cad = cadenciaCargas(fila, periodo);
    if (cad && !cad.regular) patrones.push('esporadico');
    return patrones;
}

/**
 * La foto que se guarda al marcar. Incluye el período sobre el que se vio el número: sin él,
 * una revisión hecha en enero no se puede comparar con nada (no se sabría contra qué meses se
 * midió ese consumo ni qué estados del equipo serían relevantes).
 */
export function fotoDeConsumo(fila, patron, periodo = null, nota = '') {
    const m = fila?.metrics || {};
    const cad = cadenciaCargas(fila, periodo);
    return {
        interno: fila.equipo.interno,
        patron,
        nota,
        fecha: new Date().toISOString(),
        periodo_desde: periodo?.desde || null,
        periodo_hasta: periodo?.hasta || null,
        consumo_real: m.consumo_real ?? null,
        meta: fila.confirmed?.valor ?? null,
        desvio_pct: m.desvio_pct ?? null,
        unidad: m.tipo_calculo || '',
        cargas: m.cantidad_cargas ?? 0,
        litros: m.total_litros ?? 0,
        meses_con_carga: cad ? cad.mesesConCarga : 0,
        meses_periodo: cad ? cad.mesesPeriodo : 0
    };
}

/** ¿Alguno de los rangos del estado se solapa con [desde, hasta]? Un `hasta` abierto solapa igual. */
export function rangosSolapan(rangos = [], desde, hasta) {
    if (!desde || !hasta) return false;
    return (rangos || []).some(r => r && r.desde && r.hasta && r.desde <= hasta && r.hasta >= desde);
}

const pct = (n) => `${n > 0 ? '+' : ''}${Math.round(n)}%`;

/**
 * Re-evalúa una revisión contra los datos de ahora. Cuatro resultados posibles:
 *
 *   'explicado'   — el equipo tiene un estado anotado que se solapa con el período revisado
 *                   (taller, fuera de servicio, temporada baja...). El número raro tiene
 *                   contexto; no se afirma que sea la causa.
 *   'normalizado' — el patrón ya no aparece con los datos actuales.
 *   'persiste'    — sigue igual, y ya no es un dato nuevo: es un patrón sostenido.
 *   'sin_datos'   — el equipo no tiene cargas en el período actual, así que no hay con qué comparar.
 *
 * @param {Object} revision  la foto guardada (ver fotoDeConsumo)
 * @param {Object|null} fila la fila actual del equipo, o null si no está en el análisis
 * @param {Object|null} estado  su fila de `seguimientoEquipos` (categoría + rangos), si tiene
 * @param {Object|null} periodo el período analizado ahora
 */
export function evaluarRevision(revision, fila, estado = null, periodo = null) {
    const desde = revision.periodo_desde;
    const hasta = revision.periodo_hasta;

    if (estado && ESTADOS_QUE_EXPLICAN.includes(estado.categoria)) {
        // Un estado sin rangos (anotado "en general", sin fechas) igual es contexto: se informa,
        // pero se dice que no tiene fechas, porque no se pudo verificar que cubra el período.
        const solapa = rangosSolapan(estado.rangos, desde, hasta);
        if (solapa || !(estado.rangos || []).length) {
            return {
                estado: 'explicado',
                categoria: estado.categoria,
                motivo: solapa
                    ? `Tiene anotado un estado que se solapa con el período revisado (${desde} a ${hasta}).`
                    : 'Tiene un estado anotado sin fechas, así que no se pudo verificar que cubra el período revisado.',
                detalle: estado.motivo || ''
            };
        }
    }

    if (!fila || !(fila.metrics?.cantidad_cargas > 0)) {
        return { estado: 'sin_datos', motivo: 'No tiene cargas en el período analizado ahora, así que no hay con qué comparar.' };
    }

    const ahora = patronesDe(fila, periodo);
    if (!ahora.includes(revision.patron)) {
        const d = fila.metrics.desvio_pct;
        return {
            estado: 'normalizado',
            motivo: `Con los datos actuales ya no presenta ${(PATRON_LABEL[revision.patron] || revision.patron).toLowerCase()}.`,
            detalle: d !== null && d !== undefined ? `Hoy su desvío es ${pct(d)}.` : ''
        };
    }

    const antes = revision.desvio_pct;
    const hoy = fila.metrics.desvio_pct;
    const comparacion = (antes !== null && antes !== undefined && hoy !== null && hoy !== undefined)
        ? `Pasó de ${pct(antes)} a ${pct(hoy)} de desvío.`
        : `Sigue con ${fila.metrics.cantidad_cargas} cargas registradas.`;
    return {
        estado: 'persiste',
        motivo: 'Sigue presentando el mismo patrón con más datos: ya no es un dato puntual.',
        detalle: comparacion
    };
}

const ORDEN = { persiste: 0, sin_datos: 1, explicado: 2, normalizado: 3 };

/**
 * Evalúa todas las revisiones guardadas y las ordena por lo que necesita atención primero:
 * las que persisten arriba (son las que no tienen explicación), las normalizadas al final.
 *
 * @param {Array} revisiones  las fotos guardadas
 * @param {Array} filas       filas del análisis actual
 * @param {Map}   estados     Map(interno → fila de seguimientoEquipos)
 */
export function evaluarRevisiones(revisiones = [], filas = [], estados = new Map(), periodo = null) {
    const porClave = new Map(filas.map(f => [normalizeEquipoKey(f.equipo.interno), f]));
    return revisiones
        .map(rev => {
            const clave = normalizeEquipoKey(rev.interno);
            const fila = porClave.get(clave) || null;
            return {
                revision: rev, fila,
                // La etiqueta viaja resuelta a propósito: quien arma el hallazgo (diagnostico.js)
                // no puede importar de este módulo, porque este importa de aquél.
                patronLabel: PATRON_LABEL[rev.patron] || rev.patron,
                resultado: evaluarRevision(rev, fila, estados.get(rev.interno) || null, periodo)
            };
        })
        .sort((a, b) => (ORDEN[a.resultado.estado] ?? 9) - (ORDEN[b.resultado.estado] ?? 9)
            || String(a.revision.interno).localeCompare(String(b.revision.interno)));
}
