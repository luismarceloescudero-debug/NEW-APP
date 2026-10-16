/**
 * Cargas que un equipo no pudo haber hecho.
 *
 * El caso que motivó esto (medido el 05/10/2026): CM43 es una Toyota Hilux y publicaba
 * 120,14 L/100km. De enero a julio cargaba 1 a 3 veces por mes, entre 34 y 192 L. En septiembre
 * aparecieron 23 cargas fechadas en DOS días, por 3.295 L, repartidas en cinco lugares de carga
 * y cinco centros de costo, con cargas individuales de hasta 266 L — una Hilux tiene tanque de
 * unos 80. Eran cargas de otros equipos imputadas a su interno al cargar la planilla.
 *
 * **Por qué no alcanza el hallazgo `anomalas`**, que ya existe: ese compara cada carga contra la
 * mediana del PROPIO equipo (`litros > mediana × 3`). Acá 23 de las 38 cargas de CM43 eran las
 * malas, así que corrieron su mediana para arriba y se taparon entre ellas. Cuando la mayoría de
 * las cargas de un equipo son las anómalas, su propia mediana deja de ser una referencia válida.
 *
 * Las señales usan **solo tres datos de la fila: el equipo, los litros y la fecha.** La fecha
 * agrupa por día, y de ahí salen las dos:
 *
 *   1. **Cuántas cargas en un día.** Medido sobre los 4.641 equipo-días reales: el 94,9% son una
 *      sola carga, el 4,8% dos, el 0,17% tres, y **no existe ningún equipo-día con 4, 5 ni 6**.
 *      El siguiente valor observado salta a 7, y de ahí en adelante son solo BM14 y CM43. El
 *      máximo legítimo por denominación es 3 (mixers en 1.992 días, tractores en 1.158). Por eso
 *      el umbral está en "más de 3": cae en el hueco de la distribución, no pegado a los casos.
 *   2. **Cuántos litros en un día**, contra lo que carga por vez un equipo de su misma
 *      denominación. No se usa la capacidad de tanque porque el maestro no la trae para la
 *      mayoría de los equipos, y la mediana de los pares es un proxy medido, no un número
 *      elegido.
 *
 * La **frecuencia** con que un equipo carga (cargas por mes, meses con carga) no se calcula acá:
 * ya es `cadenciaCargas()` en diagnostico.js, y de ahí sale el patrón "esporádico" de las
 * revisiones de consumo. Escribir una segunda versión es lo que prohíbe la invariante 2.
 *
 * **Lo que esta versión deliberadamente NO mira es el lugar de carga.** Una versión anterior
 * sumaba una señal geográfica ("cargó en tres lugares distintos el mismo día") y marcaba a TR32
 * por GRIS + EE SS CORONEL DIAZ + TUNUYAN. El problema no era solo que GRIS y CORONEL DIAZ están
 * los dos en Godoy Cruz —medido: en 2024/2025 las dos aparecen como OBSERVACION dentro del lugar
 * "GC"— sino que juzgar un recorrido exige saber qué distancia hay entre dos puntos, y eso la
 * planilla no lo dice. Con los litros y la fecha alcanza: sobre los archivos reales, esta sola
 * señal encuentra los dos casos verdaderos (BM14 y CM43, de 9 a 38 veces lo normal) y el equipo
 * siguiente ni se acerca al umbral.
 *
 * Es información, no corrección: los litros son plata, y acá no hay una segunda lectura única
 * (puede estar mal el interno de esas filas, o puede estar mal la fecha). Quién era el equipo
 * real no está en la fila, así que lo resuelve una persona contra el comprobante.
 *
 * Módulo puro: sin DOM ni base de datos.
 */
import { mediana } from './diagnostico.js';
import { getDenominacion } from './normalizer.js';

/**
 * Cuántas veces lo que su denominación carga por vez puede cargar un equipo en un día antes de
 * ser imposible. Cinco tanques en un día ya no se explica ni con doble turno.
 *
 * Medido sobre los archivos reales: los casos verdaderos caen entre 9 y 38 veces, y ningún otro
 * equipo-día de la flota pasa de 5. El umbral está en el hueco, no pegado a los casos.
 */
export const FACTOR_LITROS_DIA = 5;

/**
 * Cargas en un mismo día a partir de las cuales el equipo no pudo haberlas hecho.
 *
 * Medido sobre los 4.641 equipo-días reales de la flota: 1 carga el 94,9%, 2 el 4,8%, 3 el
 * 0,17%, y NINGUNO con 4, 5 ni 6. El siguiente valor observado es 7, y desde ahí son solo los
 * dos casos verdaderos. El umbral cae en ese hueco.
 */
export const MAX_CARGAS_DIA = 3;

/** Mínimo de cargas en el día para mirarlo: con una sola no hay patrón que juzgar. */
export const MIN_CARGAS_DIA = 2;

const num = (v) => parseFloat(v) || 0;
const texto = (v) => String(v == null ? '' : v).trim();

const denoDe = (equipo) => equipo.denominacion || getDenominacion(equipo.interno, equipo.tipo) || '';

/**
 * Litros por carga de cada denominación, **excluyendo al equipo que se está juzgando**.
 *
 * Esa exclusión es el punto del módulo, no un detalle: si la mediana incluyera al propio equipo,
 * sus cargas malas correrían la referencia hacia arriba y se taparían a sí mismas — el mismo
 * problema que tiene `anomalas` con la mediana propia. Un equipo único en su denominación queda
 * sin referencia a propósito: no hay pares contra los que medirlo, así que la señal volumétrica
 * se calla en vez de inventar un tope.
 *
 * Devuelve Map(denominación → Map(interno → mediana de litros por carga de los OTROS equipos)).
 */
export function litrosPorCargaPorDenominacion(filas = []) {
    const porDeno = new Map();
    for (const f of filas) {
        const deno = denoDe(f.equipo);
        if (!deno) continue;
        if (!porDeno.has(deno)) porDeno.set(deno, new Map());
        const litros = (f.cargas || []).map(c => num(c.litros)).filter(l => l > 0);
        porDeno.get(deno).set(f.equipo.interno, litros);
    }

    const out = new Map();
    for (const [deno, porInterno] of porDeno) {
        const ref = new Map();
        for (const interno of porInterno.keys()) {
            const ajenos = [];
            for (const [otro, litros] of porInterno) if (otro !== interno) ajenos.push(...litros);
            if (ajenos.length) ref.set(interno, mediana(ajenos));
        }
        out.set(deno, ref);
    }
    return out;
}

/** La referencia de un equipo puntual, o 0 si no tiene pares medidos. */
export function referenciaDe(filas, interno) {
    const f = filas.find(x => x.equipo.interno === interno);
    if (!f) return 0;
    return litrosPorCargaPorDenominacion(filas).get(denoDe(f.equipo))?.get(interno) || 0;
}

/**
 * Días en que un equipo registra cargas que no pudo haber hecho.
 *
 * @param {Array} filas  filas de analizarFlota() (equipo + cargas)
 * @returns {Array} un caso por equipo-día, del más grave al menos, con los motivos que lo marcan
 */
export function cargasImposibles(filas = []) {
    const refPorDeno = litrosPorCargaPorDenominacion(filas);
    const casos = [];

    for (const f of filas) {
        const deno = denoDe(f.equipo);
        const refCarga = refPorDeno.get(deno)?.get(f.equipo.interno) || 0;

        const porDia = new Map();
        for (const c of (f.cargas || [])) {
            const dia = texto(c.fecha).slice(0, 10);
            if (!dia) continue;
            if (!porDia.has(dia)) porDia.set(dia, []);
            porDia.get(dia).push(c);
        }

        for (const [dia, cargasDia] of porDia) {
            if (cargasDia.length < MIN_CARGAS_DIA) continue;

            // El lugar y el centro de costo se guardan como CONTEXTO para quien lee el hallazgo,
            // pero ninguna decisión se apoya en ellos: ver el docblock sobre por qué la señal
            // geográfica se quitó.
            const lugares = [...new Set(cargasDia.map(c => texto(c.lugar_carga).toUpperCase()).filter(Boolean))];
            const centros = [...new Set(cargasDia.map(c => texto(c.centro_costo).toUpperCase()).filter(Boolean))];
            const litros = cargasDia.reduce((s, c) => s + num(c.litros), 0);
            const maxCarga = Math.max(...cargasDia.map(c => num(c.litros)));

            const motivos = [];
            if (cargasDia.length > MAX_CARGAS_DIA) {
                motivos.push(`${cargasDia.length} cargas en un solo día (ningún equipo de la flota pasa de ${MAX_CARGAS_DIA})`);
            }
            // El tope en litros solo se puede juzgar si hay una referencia medida de su tipo.
            if (refCarga > 0 && litros > refCarga * FACTOR_LITROS_DIA) {
                motivos.push(`${Math.round(litros)} L en un día, ${Math.round(litros / refCarga)} veces lo que carga por vez una ${deno.toLowerCase()} (mediana ${Math.round(refCarga)} L)`);
            }
            if (!motivos.length) continue;

            casos.push({
                interno: f.equipo.interno,
                denominacion: deno,
                dia,
                cargas: cargasDia.length,
                litros,
                importe: cargasDia.reduce((s, c) => s + num(c.importe), 0),
                max_carga: maxCarga,
                lugares,
                centros,
                ref_litros_carga: refCarga,
                // Cuántas veces se pasó de lo razonable: ordena los casos y da la magnitud de un vistazo.
                veces: refCarga > 0 ? litros / refCarga : 0,
                motivos
            });
        }
    }

    return casos.sort((a, b) => b.veces - a.veces || b.litros - a.litros);
}

/**
 * Agrupa los casos por equipo, para no listar el mismo equipo una vez por día.
 * Devuelve un caso por equipo con el total de litros y días involucrados.
 */
export function porEquipo(casos = []) {
    const mapa = new Map();
    for (const c of casos) {
        if (!mapa.has(c.interno)) {
            mapa.set(c.interno, {
                interno: c.interno, denominacion: c.denominacion, dias: [], cargas: 0,
                litros: 0, importe: 0, max_carga: 0, lugares: new Set(), motivos: new Set()
            });
        }
        const e = mapa.get(c.interno);
        e.dias.push(c.dia);
        e.cargas += c.cargas;
        e.litros += c.litros;
        e.importe += c.importe;
        e.max_carga = Math.max(e.max_carga, c.max_carga);
        c.lugares.forEach(l => e.lugares.add(l));
        c.motivos.forEach(m => e.motivos.add(m));
    }
    return [...mapa.values()]
        .map(e => ({ ...e, dias: e.dias.sort(), lugares: [...e.lugares], motivos: [...e.motivos] }))
        .sort((a, b) => b.litros - a.litros);
}
