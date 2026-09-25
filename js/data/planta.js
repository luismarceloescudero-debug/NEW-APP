/**
 * Servicios de planta (caldera CA, caloventor CL, limpieza LM, motocompresor MT): equipos que
 * consumen combustible por tiempo de uso, sin GPS y sin km. No son flota rodante, así que no se les
 * mide consumo por km ni por hora, pero sus cargas son gasto real y se quedan para análisis.
 *
 * Este módulo es puro (sin DOM ni base de datos). Resuelve dos cosas:
 *
 * 1. Qué pasó en los meses del período en los que NO cargaron. Un servicio de planta puede cargar de
 *    forma esporádica, o muy poco, y eso no es un error. Se asume, siempre corregible:
 *      - carga en ARIDOS  → temporada baja
 *      - carga en otro lugar → fuera de servicio
 * 2. Con quién compararlo: mismo tipo, y entre esos el más parecido en marca, modelo, potencia,
 *    capacidad y, a igualdad, el año más cercano.
 */
import { normalizeString, normalizeEquipoKey, getPrefijo, getDenominacion } from './normalizer.js';
import { mesesCompletosDeRango } from './alcance.js';

export const PREFIJOS_PLANTA = ['CA', 'CL', 'LM', 'MT'];

export const esServicioPlanta = (interno) => PREFIJOS_PLANTA.includes(getPrefijo(normalizeEquipoKey(interno)));

const mesDe = (fecha) => String(fecha || '').slice(0, 7);
const ultimoDia = (ym) => { const [a, m] = ym.split('-').map(Number); return String(new Date(a, m, 0).getDate()).padStart(2, '0'); };

/** ¿Este equipo carga en ARIDOS? Se mira el lugar de carga y el sector de sus cargas. */
export function cargaEnAridos(cargas = []) {
    const en = cargas.filter(c => /ARIDOS/.test(normalizeString(c.lugar_carga)) || /ARIDOS/.test(normalizeString(c.sector)));
    return cargas.length > 0 && en.length * 2 >= cargas.length;
}

/**
 * Meses del período sin ninguna carga, y el estado que se les asume. Devuelve null si cargó todos
 * los meses (no hay nada que asumir) o si no hay ninguna carga (no hay de dónde deducir el lugar).
 * `rangos` va en el mismo formato que usa el estado del equipo: { desde, hasta, categoria }, uno por
 * tramo de meses consecutivos.
 */
export function inferirEstadoPlanta({ cargas = [], periodo = null } = {}) {
    if (!cargas.length || !periodo || !periodo.desde || !periodo.hasta) return null;
    const mesesPeriodo = mesesCompletosDeRango(periodo.desde, periodo.hasta);
    if (!mesesPeriodo.length) return null;
    const conCarga = new Set(cargas.map(c => mesDe(c.fecha)).filter(m => mesesPeriodo.includes(m)));
    if (!conCarga.size) return null;
    const sin = mesesPeriodo.filter(m => !conCarga.has(m));
    if (!sin.length) return null;

    const aridos = cargaEnAridos(cargas);
    const categoria = aridos ? 'temporada_baja' : 'fuera_servicio';
    const rangos = [];
    let tramo = null;
    for (const m of mesesPeriodo) {
        if (conCarga.has(m)) { tramo = null; continue; }
        if (tramo) { tramo.hasta = `${m}-${ultimoDia(m)}`; }
        else { tramo = { desde: `${m}-01`, hasta: `${m}-${ultimoDia(m)}`, categoria }; rangos.push(tramo); }
    }
    return {
        categoria, aridos, rangos, mesesSinCarga: sin, mesesConCarga: mesesPeriodo.filter(m => conCarga.has(m)), mesesPeriodo,
        motivo: `Sin cargas en ${sin.join(', ')}: se asume ${aridos ? 'temporada baja (carga en ARIDOS)' : 'fuera de servicio (carga fuera de ARIDOS)'}. Corregible desde Estado.`
    };
}

const igual = (a, b) => { const x = normalizeString(a), y = normalizeString(b); return !!x && x === y; };

/**
 * Pares comparables de un equipo, del más parecido al menos. Tiene que ser el mismo tipo; entre
 * esos pesan marca, modelo, potencia y capacidad (1 punto cada una), y a igual puntaje gana el
 * año más cercano. Sin mismo tipo no hay comparación: un caloventor no se compara con una caldera.
 */
export function paresComparables(equipo, equipos = []) {
    const tipo = equipo.denominacion || getDenominacion(equipo.interno, equipo.tipo);
    const anio = Number(equipo.anio) || null;
    return equipos
        .filter(e => e.interno !== equipo.interno && (e.denominacion || getDenominacion(e.interno, e.tipo)) === tipo)
        .map(e => {
            const coincide = ['marca', 'modelo', 'potencia', 'capacidad'].filter(c => igual(equipo[c], e[c]));
            const ea = Number(e.anio) || null;
            return { equipo: e, coincide, puntaje: coincide.length, deltaAnio: anio && ea ? Math.abs(anio - ea) : null };
        })
        .sort((a, b) => b.puntaje - a.puntaje
            || (a.deltaAnio ?? Infinity) - (b.deltaAnio ?? Infinity)
            || a.equipo.interno.localeCompare(b.equipo.interno));
}
