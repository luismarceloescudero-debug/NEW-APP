/**
 * Resolución automática de identidad: decide, con evidencia, a qué equipo real corresponde un
 * código dudoso. Todo puro (sin DOM ni base de datos) para poder probarlo; quien lo aplica y lo
 * deja revertible es autocorreccion.js.
 *
 * Tres casos, los únicos donde la evidencia alcanza para no adivinar:
 *
 * 1. Tipeo de un interno real (GR01 en vez de GE01): el código está a UNA edición de un interno
 *    del maestro, su prefijo no existe en ningún lado de la flota (ver sugerirPosibleTypo) Y
 *    comparte con ese equipo el lugar de carga o el centro de costo. Sin esa segunda pista no se
 *    corrige: quedar a una letra de otro código es común entre equipos distintos.
 * 2. Servicio de planta escrito con su nombre (LIMPIEZA, CALDERA): el LUGAR DE CARGA de la misma
 *    fila dice de qué sede es, igual que ya se hace con los caloventores.
 * 3. Un interno con dos patentes: gana la que ya declara el maestro; si el maestro no la tiene,
 *    la mayoritaria, pero solo si lo es con claridad.
 */
import { normalizeString, normalizeEquipoKey, sugerirPosibleTypo } from './normalizer.js';

// Servicios de planta que la planilla a veces trae escritos con su nombre en vez del código.
// Lugar de carga → código de la sede. Confirmado con HSV: un servicio por sede.
export const SERVICIO_POR_SEDE = {
    LIMPIEZA: [['GODOY CRUZ', 'LM01']],
    CALDERA: [['TUNUYAN', 'CA01']]
};

/** Mayoría clara: la patente más frecuente tiene que duplicar a la siguiente. */
const RAZON_MAYORIA = 2;

const conjunto = (cargas, campo) => new Set(cargas.map(c => normalizeString(c[campo])).filter(Boolean));
const compartido = (a, b) => [...a].filter(x => b.has(x));

/**
 * Caso 1. `cargasDelCodigo` son las del código dudoso; `cargasTodas` las de toda la planilla
 * (para conocer dónde carga el equipo candidato). Devuelve { destino, evidencia } o null.
 */
export function proponerTipeo(codigo, cargasDelCodigo, cargasTodas, equipos) {
    const destino = sugerirPosibleTypo(codigo, equipos.map(e => e.interno).filter(Boolean));
    if (!destino) return null;
    const claveDestino = normalizeEquipoKey(destino);
    const delDestino = cargasTodas.filter(c => c.interno_key === claveDestino);
    const lugares = compartido(conjunto(cargasDelCodigo, 'lugar_carga'), conjunto(delDestino, 'lugar_carga'));
    const centros = compartido(conjunto(cargasDelCodigo, 'centro_costo'), conjunto(delDestino, 'centro_costo'));
    if (!lugares.length && !centros.length) return null;
    const pistas = [];
    if (lugares.length) pistas.push(`mismo lugar de carga (${lugares.join(', ')})`);
    if (centros.length) pistas.push(`mismo centro de costo (${centros.join(', ')})`);
    return { destino, evidencia: `a una letra de ${destino}, ${pistas.join(' y ')}` };
}

/** Caso 2. Código de una fila puntual según su lugar de carga, o null si no es un servicio o no hay sede. */
export function servicioPorLugar(interno, lugarCarga) {
    const sedes = SERVICIO_POR_SEDE[normalizeString(interno)];
    if (!sedes) return null;
    const lugar = normalizeString(lugarCarga);
    const hit = sedes.find(([nombre]) => lugar.includes(nombre));
    return hit ? hit[1] : null;
}

/**
 * Caso 3. `dominios` es Map(patente → cantidad de filas). Devuelve { dominio, motivo } o null si
 * no hay una ganadora clara. `dominioMaestro` es la patente que declara el maestro, si la tiene.
 */
export function elegirPatente(dominios, dominioMaestro = '') {
    const clave = normalizeString(dominioMaestro);
    if (clave) {
        const propia = [...dominios.keys()].find(d => normalizeString(d) === clave);
        if (propia) return { dominio: propia, motivo: 'es la patente que declara el maestro' };
    }
    const orden = [...dominios.entries()].sort((a, b) => b[1] - a[1]);
    if (orden.length < 2) return null;
    const [[ganadora, n1], [, n2]] = orden;
    if (n1 < n2 * RAZON_MAYORIA) return null;
    return { dominio: ganadora, motivo: `es la mayoritaria (${n1} filas contra ${n2})` };
}
