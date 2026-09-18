/**
 * Esquemas de planilla — Fase 7 (importación flexible).
 *
 * Qué campos entiende la app de cada tipo de planilla conocido, con qué nombres de columna
 * suelen venir (sinónimos), cuáles son imprescindibles, y cómo reconocer el FORMATO de los
 * valores de una columna (fecha, número, horas, identidad, texto).
 *
 * Se usa en dos lugares:
 *  - xlsx-parser.js → inspeccionarArchivo(): cuando un archivo no coincide exacto con un
 *    formato conocido, puntúa contra cada esquema para sugerir de qué tipo es y qué columna
 *    corresponde a cada campo, en vez de importarlo en silencio como "otra planilla".
 *  - ui/mapeo.js → la vista previa, que muestra esa sugerencia y deja corregirla.
 *
 * Las claves de `campos` son EXACTAMENTE las que ya usan los importadores de xlsx-parser.js
 * en val(row, 'campo', ...): un mapeo {campo: 'ENCABEZADO'} confirmado acá se pasa tal cual
 * al importador y este lo respeta antes que sus propios nombres por defecto.
 */
import { normalizeString, parseNumber } from '../data/normalizer.js';

// Identidad: en todos los tipos, "interno" y "dominio" se resuelven juntos (extraerIdentidad)
// y alcanza con una columna que traiga cualquiera de los dos — o los dos juntos, como la
// columna "INTERNO-DOMINIO" de Cargas ("TR21 AD291BF").
const IDENTIDAD_INTERNO = ['INTERNO-DOMINIO', 'INTERNO DOMINIO', 'INTERNO', 'NRO INTERNO', 'N INTERNO', 'NUMERO INTERNO', 'MOVIL', 'UNIDAD', 'EQUIPO', 'CODIGO EQUIPO', 'COD EQUIPO'];
const IDENTIDAD_DOMINIO = ['DOMINIO', 'PATENTE', 'MATRICULA', 'CHAPA'];

export const ESQUEMAS = {
    EQUIPOS: {
        etiqueta: 'Equipos (maestro)',
        campos: {
            interno:   { etiqueta: 'Interno', sinonimos: IDENTIDAD_INTERNO, requerido: true, identidad: true },
            dominio:   { etiqueta: 'Dominio / patente', sinonimos: IDENTIDAD_DOMINIO, identidad: true },
            tipo:      { etiqueta: 'Tipo', sinonimos: ['TIPO', 'CATEGORIA', 'CLASE', 'TIPO DE EQUIPO'] },
            marca:     { etiqueta: 'Marca', sinonimos: ['MARCA', 'FABRICANTE'], requerido: true },
            modelo:    { etiqueta: 'Modelo', sinonimos: ['MODELO'] },
            potencia:  { etiqueta: 'Potencia', sinonimos: ['POTENCIA', 'HP', 'CV', 'KW', 'POTENCIA (HP)', 'POTENCIA HP'] },
            capacidad: { etiqueta: 'Capacidad', sinonimos: ['CAPACIDAD', 'CARGA UTIL', 'CAPACIDAD DE CARGA'] },
            anio:      { etiqueta: 'Año', sinonimos: ['AÑO', 'ANO', 'AÑO FABRICACION', 'AÑO MODELO'], formato: 'numero' },
            ubicacion: { etiqueta: 'Ubicación', sinonimos: ['UBICACION', 'SEDE', 'BASE', 'PROVINCIA'] }
        }
    },
    ESTIMADOS: {
        etiqueta: 'Consumos Estimados (metas)',
        campos: {
            interno: { etiqueta: 'Interno', sinonimos: IDENTIDAD_INTERNO, requerido: true, identidad: true },
            dominio: { etiqueta: 'Dominio / patente', sinonimos: IDENTIDAD_DOMINIO, identidad: true },
            meta:    { etiqueta: 'Consumo estimado (meta)', sinonimos: ['CONSUMO ESTIMADO', 'ESTIMADO', 'META', 'CONSUMO OBJETIVO', 'CONSUMO TEORICO', 'CONSUMO ESPERADO'], requerido: true },
            tipo:    { etiqueta: 'Tipo', sinonimos: ['TIPO', 'CATEGORIA'] },
            marca:   { etiqueta: 'Marca', sinonimos: ['MARCA'] },
            modelo:  { etiqueta: 'Modelo', sinonimos: ['MODELO'] }
        }
    },
    CARGAS: {
        etiqueta: 'Cargas de Combustible',
        campos: {
            interno:      { etiqueta: 'Interno (o interno + dominio)', sinonimos: IDENTIDAD_INTERNO, requerido: true, identidad: true },
            dominio:      { etiqueta: 'Dominio / patente', sinonimos: IDENTIDAD_DOMINIO, identidad: true },
            fecha:        { etiqueta: 'Fecha', sinonimos: ['FECHA', 'DATE', 'DIA', 'FECHA DE CARGA'], requerido: true, formato: 'fecha' },
            // Sin "CANTIDAD" ni "VOLUMEN" a propósito: son palabras de cualquier planilla (una de
            // cubiertas trae "Cantidad") y harían sugerir "Cargas de Combustible" para algo que no
            // es combustible. Si una planilla de cargas real las usa, se eligen a mano en la vista
            // previa y el formato queda recordado.
            litros:       { etiqueta: 'Litros', sinonimos: ['LITROS', 'LTS', 'LT', 'LITROS CARGADOS'], requerido: true, formato: 'numero' },
            importe:      { etiqueta: 'Costo total', sinonimos: ['COSTO TOTAL', 'IMPORTE', 'MONTO', 'TOTAL', 'COSTO'], formato: 'numero' },
            precio:       { etiqueta: 'Precio unitario', sinonimos: ['PRECIO UNITARIO', 'PRECIO', 'PRECIO POR LITRO', '$/LT'], formato: 'numero' },
            combustible:  { etiqueta: 'Tipo de combustible', sinonimos: ['TIPO DE COMBUSTIBLE', 'COMBUSTIBLE', 'PRODUCTO'] },
            lugar:        { etiqueta: 'Lugar de carga', sinonimos: ['LUGAR DE CARGA', 'LUGAR', 'SURTIDOR', 'ESTACION', 'ESTACION DE SERVICIO'] },
            chofer:       { etiqueta: 'Chofer', sinonimos: ['CHOFER', 'CONDUCTOR', 'OPERADOR'] },
            sector:       { etiqueta: 'Sector', sinonimos: ['SECTOR'] },
            centro_costo: { etiqueta: 'Centro de costo', sinonimos: ['CENTRO DE COSTO', 'C. COSTO', 'CC', 'CENTRO COSTO'] }
        }
    },
    GPS: {
        etiqueta: 'Resumen de Flota (GPS)',
        campos: {
            interno:    { etiqueta: 'Unidad / interno', sinonimos: IDENTIDAD_INTERNO, requerido: true, identidad: true },
            dominio:    { etiqueta: 'Dominio / patente', sinonimos: IDENTIDAD_DOMINIO, identidad: true },
            km:         { etiqueta: 'Kilómetros', sinonimos: ['KILOMETROS RECORRIDOS', 'KILOMETROS', 'DISTANCIA', 'KM', 'KMS'], requerido: true, formato: 'numero' },
            movimiento: { etiqueta: 'Tiempo en movimiento', sinonimos: ['TIEMPO EN MOVIMIENTO', 'HORAS MOVIMIENTO', 'HORAS', 'HS'], formato: 'horas' },
            ralenti:    { etiqueta: 'Tiempo en ralentí', sinonimos: ['TIEMPO EN RALENTI', 'RALENTI', 'HORAS RALENTI'], formato: 'horas' },
            parado:     { etiqueta: 'Tiempo parado', sinonimos: ['TIEMPO PARADO', 'TIEMPO DETENIDO'], formato: 'horas' }
        }
    }
};

export const TIPOS_CONOCIDOS = Object.keys(ESQUEMAS);

const limpio = (s) => normalizeString(s).replace(/[^A-Z0-9$/]/g, '');

/**
 * ¿Este encabezado corresponde a alguno de estos sinónimos? Primero coincidencia exacta
 * (normalizada), después "contiene" — pero solo con sinónimos de 3+ letras, para que "HS" o
 * "CC" no matcheen cualquier columna que casualmente contenga esas letras.
 */
function coincide(header, sinonimos) {
    const h = limpio(header);
    if (!h) return 0;
    for (const s of sinonimos) if (limpio(s) === h) return 2;
    for (const s of sinonimos) { const ls = limpio(s); if (ls.length >= 4 && h.includes(ls)) return 1; }
    return 0;
}

/**
 * Sugiere qué columna corresponde a cada campo del esquema: {campo: header}. Cada encabezado
 * se asigna a un solo campo (el de mejor coincidencia), así "TIPO DE COMBUSTIBLE" no queda
 * también como "tipo" de equipo.
 */
export function sugerirMapeo(tipo, headers = []) {
    const esquema = ESQUEMAS[tipo];
    if (!esquema) return {};
    const candidatos = [];
    Object.entries(esquema.campos).forEach(([campo, def]) => {
        headers.forEach(h => {
            const p = coincide(h, def.sinonimos);
            if (p) candidatos.push({ campo, header: h, p });
        });
    });
    candidatos.sort((a, b) => b.p - a.p);
    const mapeo = {}, usados = new Set();
    candidatos.forEach(c => {
        if (mapeo[c.campo] || usados.has(c.header)) return;
        mapeo[c.campo] = c.header;
        usados.add(c.header);
    });
    return mapeo;
}

/**
 * Qué tan bien encajan estos encabezados en cada tipo conocido.
 * Devuelve [{tipo, etiqueta, puntaje (0..1), mapeo, faltantes: [etiqueta de campo requerido]}]
 * ordenado de mejor a peor. Un tipo con requeridos faltantes queda con puntaje reducido pero
 * igual aparece: la vista previa es justamente para completar lo que falta.
 */
export function puntuarEsquemas(headers = []) {
    return TIPOS_CONOCIDOS.map(tipo => {
        const esquema = ESQUEMAS[tipo];
        const mapeo = sugerirMapeo(tipo, headers);
        const campos = Object.entries(esquema.campos);
        const requeridos = campos.filter(([, d]) => d.requerido);
        // La identidad se cumple con interno O dominio: hay planillas que solo traen la patente.
        const tieneIdentidad = campos.some(([c, d]) => d.identidad && mapeo[c]);
        const faltantes = requeridos.filter(([c, d]) => !mapeo[c] && !(d.identidad && tieneIdentidad)).map(([, d]) => d.etiqueta);
        const reconocidos = campos.filter(([c]) => mapeo[c]).length;
        // Los requeridos pesan el doble: una planilla que tiene "INTERNO" y "MARCA" se parece
        // más a Equipos que una que tiene tres columnas opcionales cualquiera.
        const pesoTotal = campos.length + requeridos.length;
        const peso = reconocidos + requeridos.filter(([c]) => mapeo[c]).length;
        const puntaje = pesoTotal ? peso / pesoTotal : 0;
        return { tipo, etiqueta: esquema.etiqueta, puntaje, mapeo, faltantes };
    }).sort((a, b) => b.puntaje - a.puntaje);
}

/**
 * Firma de un formato de planilla: el conjunto de sus encabezados, normalizado y ordenado.
 * Dos archivos del mismo sistema (el mismo reporte de otro mes) tienen la misma firma aunque
 * cambie el nombre del archivo; si alguien agrega o renombra una columna, la firma cambia y
 * el mapeo recordado deja de aplicarse (se vuelve a pedir confirmación — a propósito).
 */
export function firmaEncabezados(headers = []) {
    const base = [...new Set(headers.map(limpio).filter(Boolean))].sort().join('|');
    let h = 5381;
    for (let i = 0; i < base.length; i++) h = ((h << 5) + h + base.charCodeAt(i)) >>> 0;
    return 'firma:' + h.toString(16);
}

const RE_DOMINIO = /^([A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2})$/;
const RE_INTERNO = /^[A-Z]{1,4}-?\s?\d{1,4}$/;
const RE_FECHA_TXT = /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$|^\d{4}-\d{2}-\d{2}/;
const RE_HORA_TXT = /^\d{1,3}:\d{2}(:\d{2})?$/;

/**
 * Formato de una columna a partir de sus valores (se miran los primeros no vacíos).
 * Devuelve { formato, detalle } donde formato ∈ 'vacia' | 'identidad' | 'fecha' | 'horas' |
 * 'numero' | 'texto', y detalle es una aclaración legible ("coma decimal", "fecha de Excel",
 * "fracción de día", "dd/mm/aaaa"...). Es orientativo: la conversión real la hacen los
 * importadores con parseDate/parseNumber/parseExcelHours, que ya aceptan todas estas formas.
 */
export function detectarFormatoColumna(valores = [], header = '') {
    const vals = valores.filter(v => v !== '' && v !== null && v !== undefined).slice(0, 40);
    if (!vals.length) return { formato: 'vacia', detalle: 'sin valores' };
    const h = limpio(header);
    const texto = vals.map(v => normalizeString(String(v)).trim());
    const prop = (fn) => vals.filter(fn).length / vals.length;

    // Una patente o "interno dominio" juntos son identidad por su forma. Un código suelto tipo
    // "X1" o "F350" también podría ser un MODELO: solo se toma como identidad si además el
    // encabezado lo sugiere (interno, unidad, móvil, equipo, código).
    const pareceColumnaId = /INTERNO|UNIDAD|MOVIL|EQUIPO|CODIGO|DOMINIO|PATENTE/.test(h);
    const esIdentidad = t => RE_DOMINIO.test(t.replace(/\s/g, '')) || /^[A-Z]{1,4}-?\d{1,4}\s+[A-Z0-9 ]{5,9}$/.test(t) || (pareceColumnaId && RE_INTERNO.test(t));
    if (texto.filter(esIdentidad).length / texto.length >= 0.7) {
        const juntos = texto.filter(t => /\s/.test(t.trim()) && /^[A-Z]{1,4}\d/.test(t)).length;
        return { formato: 'identidad', detalle: juntos ? 'interno + dominio juntos' : 'código de equipo' };
    }
    if (prop(v => typeof v === 'string' && RE_FECHA_TXT.test(v.trim())) >= 0.7) {
        const ej = String(vals.find(v => typeof v === 'string')).trim();
        return { formato: 'fecha', detalle: /^\d{4}-/.test(ej) ? 'aaaa-mm-dd' : 'dd/mm/aaaa' };
    }
    if (prop(v => typeof v === 'string' && RE_HORA_TXT.test(v.trim())) >= 0.7) return { formato: 'horas', detalle: 'hh:mm' };

    const numericos = vals.filter(v => typeof v === 'number' || /^[\d.,\s$-]+$/.test(String(v).trim()));
    if (numericos.length / vals.length >= 0.8) {
        const nums = numericos.map(v => typeof v === 'number' ? v : parseNumber(v));
        // Serial de fecha de Excel (días desde 1900): en una columna que se llama fecha, o con
        // todos los valores en el rango de fechas de este siglo.
        const pareceSerial = nums.every(n => n > 36000 && n < 60000 && Number.isInteger(Math.round(n * 1e6) / 1e6));
        if (/FECHA|DIA|DATE/.test(h) || (pareceSerial && nums.every(Number.isInteger))) return { formato: 'fecha', detalle: 'fecha de Excel (número de serie)' };
        // Tiempo como fracción de día (0,5 = 12 h): así exporta el GPS las horas.
        if (/TIEMPO|HORA|RALENTI|MOVIMIENTO|HS/.test(h) && nums.every(n => n >= 0 && n < 40)) return { formato: 'horas', detalle: nums.some(n => n < 1 && n > 0) ? 'fracción de día (Excel)' : 'horas decimales' };
        const txt = numericos.filter(v => typeof v === 'string').map(String);
        const comaDecimal = txt.some(t => /,\d{1,2}$/.test(t.trim()));
        return { formato: 'numero', detalle: txt.length ? (comaDecimal ? 'texto con coma decimal' : 'texto numérico') : 'número' };
    }
    return { formato: 'texto', detalle: '' };
}
