/**
 * Alcance parcial de una carga: cuándo lo subido cubre UN solo tipo de equipo (por ejemplo solo
 * camionetas) y solo algunos meses, en vez de toda la flota.
 *
 * Por qué existe: la app alinea el período con los meses comunes a todas las planillas y analiza
 * todos los equipos. Si alguien sube los Resumen de viaje de seis camionetas de agosto, el período
 * mostrado sigue siendo enero–agosto y nada explica por qué. Acá se detecta ese caso para que la app
 * PREGUNTE, en vez de decidir sola: analizar solo ese tipo de equipo y esos meses, o descartar el
 * recorte y quedarse con el período común de toda la flota.
 *
 * Todo lo de este archivo es puro (sin DOM ni base de datos) para poder probarlo.
 */
import { indexarMaestro, resolverEquipo, mesesEntre } from './analyzer.js';
import { getDenominacion } from './normalizer.js';

const denominacionDe = (eq) => eq.denominacion || getDenominacion(eq.interno, eq.tipo);

const ISO = /^\d{4}-\d{2}-\d{2}/;

/**
 * Meses (YYYY-MM) que un rango declarado cubre ENTEROS. Un mes a medias no cuenta: el proyecto
 * analiza solo meses completos (ver mesesCompletosDeFuente en analyzer.js), así que un resumen
 * del 1 al 15 no autoriza a recortar el análisis a ese mes.
 */
export function mesesCompletosDeRango(desde, hasta) {
    if (!ISO.test(String(desde || '')) || !ISO.test(String(hasta || ''))) return [];
    const d = String(desde).slice(0, 10);
    const h = String(hasta).slice(0, 10);
    if (d > h) return [];
    return mesesEntre(d.slice(0, 7), h.slice(0, 7)).filter(ym => {
        const [anio, mes] = ym.split('-').map(Number);
        const ultimo = String(new Date(anio, mes, 0).getDate()).padStart(2, '0');
        return d <= `${ym}-01` && h >= `${ym}-${ultimo}`;
    });
}

/**
 * ¿Los Resumen de viaje cubren un solo tipo de equipo, dentro de una flota que tiene varios?
 * Devuelve { denominacion, unidades, meses, firma } o null si no hay nada que preguntar.
 *
 * `firma` identifica ESTE conjunto de resúmenes: la decisión del usuario se guarda contra ella,
 * así no se le vuelve a preguntar lo mismo, pero sí si sube otros resúmenes.
 */
export function detectarAlcanceParcial(comparativas = [], equipos = []) {
    if (!comparativas.length || !equipos.length) return null;
    const tiposDeLaFlota = new Set(equipos.map(denominacionDe));
    if (tiposDeLaFlota.size < 2) return null;

    const idx = indexarMaestro(equipos);
    const unidades = new Map();
    for (const r of comparativas) {
        const eq = resolverEquipo(r, idx);
        if (eq) unidades.set(eq.interno, denominacionDe(eq));
    }
    const tipos = new Set(unidades.values());
    if (tipos.size !== 1) return null;

    const meses = [...new Set(comparativas.flatMap(r => mesesCompletosDeRango(r.fecha, r.fecha_hasta || r.fecha)))].sort();
    if (!meses.length) return null;

    const [denominacion] = tipos;
    const internos = [...unidades.keys()].sort();
    return { denominacion, unidades: internos, meses, firma: `${denominacion}|${meses.join(',')}|${internos.join(',')}` };
}

/**
 * Recorta el universo a un tipo de equipo: los equipos de esa denominación y SOLO los registros que
 * resuelven a alguno de ellos. Filtrar solo los equipos no alcanza: los registros de las demás
 * unidades quedarían como "no asignados" y seguirían sumando a los totales (invariante 1b), que es
 * exactamente lo que un recorte por tipo no tiene que hacer.
 */
export function filtrarPorAlcance(equipos = [], rawRecords = [], alcance = null) {
    if (!alcance || !alcance.denominacion) return { equipos, rawRecords };
    const propios = equipos.filter(eq => denominacionDe(eq) === alcance.denominacion);
    const idx = indexarMaestro(propios);
    return { equipos: propios, rawRecords: rawRecords.filter(r => resolverEquipo(r, idx)) };
}
