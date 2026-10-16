/**
 * Estados de equipo (fuera de servicio, traslado a San Juan, talleres, vendido) y alta de equipos
 * nuevos. Módulo puro: sin DOM ni base de datos. Los estados viven en el store `seguimientoEquipos`
 * (ver database.js) y sus rangos descuentan días del denominador de cobertura; la UI está en
 * ui/estados.js.
 */
import { normalizeEquipoKey } from './normalizer.js';

export const CATEGORIAS_SEGUIMIENTO = [
    { id: 'fuera_servicio', label: 'Fuera de servicio' },
    { id: 'traslado_sj', label: 'Traslado a San Juan' },
    { id: 'taller_ext', label: 'Taller externo' },
    { id: 'taller_int', label: 'Taller interno' },
    { id: 'vendido', label: 'Vendido' },
    { id: 'temporada_baja', label: 'Temporada baja' },
    { id: 'sin_chofer', label: 'Sin chofer asignado' },
    { id: 'backup', label: 'Backup / uso esporádico (ej. grupo electrógeno solo sin energía de red)' },
    { id: 'otro', label: 'Otro (detallar)' }
];

/** Las categorías que saca al equipo de la operación: las que junta la tarjeta del dashboard. */
export const CATEGORIAS_FUERA_DE_OPERACION = ['fuera_servicio', 'traslado_sj', 'taller_ext', 'taller_int', 'vendido'];

/** Fin de un estado que sigue vigente. Los rangos se recortan al período analizado, así que alcanza con una fecha lejana. */
export const HASTA_ABIERTO = '2099-12-31';

/** Cuántos equipos hay en cada estado de "fuera de operación". `seguimientos` = filas del store. */
export function contarEstados(seguimientos = []) {
    const porCategoria = Object.fromEntries(CATEGORIAS_FUERA_DE_OPERACION.map(c => [c, 0]));
    let total = 0;
    for (const s of seguimientos) {
        if (!(s.categoria in porCategoria)) continue;
        porCategoria[s.categoria]++;
        total++;
    }
    return { total, porCategoria };
}

/** Rango del estado: desde la fecha elegida, hasta la fecha de fin o abierto. Sin `desde` no hay rango. */
export function rangoDeEstado({ desde = '', hasta = '', categoria }) {
    if (!desde) return [];
    return [{ desde, hasta: hasta || HASTA_ABIERTO, categoria }];
}

/**
 * Fecha de venta de un equipo: el inicio de su estado 'vendido'. No hay un campo aparte a
 * propósito — la venta ES el estado, y duplicar el dato abre la puerta a que los dos no
 * coincidan. Devuelve null si el equipo no está vendido.
 */
export function fechaDeVenta(estado) {
    if (!estado || estado.categoria !== 'vendido') return null;
    const desdes = (estado.rangos || []).filter(r => r?.categoria === 'vendido' && r.desde).map(r => r.desde);
    return desdes.length ? desdes.sort()[0] : null;
}

/**
 * Cargas fechadas DESPUÉS de la venta de un equipo.
 *
 * Por qué no se descuentan solas: vender un equipo no borra lo que gastó mientras era de la
 * empresa, así que un equipo vendido sigue sumando a los totales y sigue teniendo su tarjeta —
 * eso es correcto y es lo que se quiere ver cuando el período incluye meses previos a la venta.
 * Lo que NO puede ser es que aparezcan cargas posteriores: o la fecha de venta está mal, o esas
 * cargas se imputaron al equipo equivocado. Las dos salidas necesitan que una persona decida,
 * así que esto se informa y no se corrige solo (misma regla que el resto de la plata).
 *
 * @param {Array} filas    filas de analizarFlota()
 * @param {Map}   estados  Map(interno → fila de seguimientoEquipos)
 */
export function cargasPosterioresALaVenta(filas = [], estados = new Map()) {
    const casos = [];
    for (const f of filas) {
        const venta = fechaDeVenta(estados.get(f.equipo.interno));
        if (!venta) continue;
        const posteriores = (f.cargas || []).filter(c => c.fecha && c.fecha > venta);
        if (!posteriores.length) continue;
        casos.push({
            interno: f.equipo.interno,
            denominacion: f.equipo.denominacion,
            fecha_venta: venta,
            cargas: posteriores.length,
            litros: posteriores.reduce((s, c) => s + (parseFloat(c.litros) || 0), 0),
            importe: posteriores.reduce((s, c) => s + (parseFloat(c.importe) || 0), 0),
            primera: posteriores.map(c => c.fecha).sort()[0],
            ultima: posteriores.map(c => c.fecha).sort().pop()
        });
    }
    return casos.sort((a, b) => b.litros - a.litros);
}

const CAMPOS_ALTA = [
    { id: 'dominio', label: 'Patente' },
    { id: 'marca', label: 'Marca' },
    { id: 'modelo', label: 'Modelo' },
    { id: 'anio', label: 'Año' },
    { id: 'potencia', label: 'Potencia' }
];
export const CAMPOS_ALTA_EQUIPO = CAMPOS_ALTA;

const vacio = (v) => v === undefined || v === null || String(v).trim() === '';

/** Datos que le faltan a un equipo del maestro para estar completo (ids de CAMPOS_ALTA_EQUIPO). */
export function datosFaltantes(equipo) {
    return CAMPOS_ALTA.filter(c => vacio(equipo[c.id])).map(c => c.id);
}

/** Equipos dados de alta solos (por el análisis) a los que todavía les faltan datos del padrón. */
export function altasConDatosPendientes(equipos = []) {
    return equipos
        .filter(e => e.alta_automatica)
        .map(e => ({ equipo: e, faltan: datosFaltantes(e) }))
        .filter(x => x.faltan.length > 0);
}

/**
 * Valida un alta manual. Devuelve { ok, interno } con el interno limpio, o { ok: false, motivo }.
 * El duplicado se detecta por clave normalizada: TR-21, TR 21 y TR21 son el mismo equipo.
 */
export function validarAlta(interno, equipos = []) {
    const limpio = String(interno || '').trim().toUpperCase();
    if (!limpio) return { ok: false, motivo: 'Falta el interno.' };
    const clave = normalizeEquipoKey(limpio);
    if (!clave) return { ok: false, motivo: 'El interno no tiene un formato válido.' };
    const existente = equipos.find(e => normalizeEquipoKey(e.interno) === clave);
    if (existente) return { ok: false, motivo: `Ya existe en el maestro como ${existente.interno}.` };
    return { ok: true, interno: limpio };
}
