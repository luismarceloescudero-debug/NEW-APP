/**
 * Identidad de un equipo: interno, dominio, clave de cruce y correcciones confirmadas.
 *
 * Es el "comun denominador" del sistema — un equipo figura en una planilla solo por interno y
 * en otra solo por patente, y si las dos claves no se normalizan igual el cruce pierde
 * registros en silencio. Los casos de acá salen de CLAUDE.md ("Correcciones de codigo
 * confirmadas", "identidad INTERNO DOMINIO") y de los comprobantes reales de HSV.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    getPrefijo, getDenominacion, getBandera, tipoLugarCarga, getProvincia,
    normalizeEquipoKey, identidadTexto, clasificarIdentificador, extraerIdentidad,
    corregirCodigoConocido, corregirCaloventorPorLugar, sugerirPosibleTypo,
    claveCargaExacta, claveGpsExacta, slugCampo
} from '../js/data/normalizer.js';

// --- prefijo y denominacion ---------------------------------------------------------------

test('getPrefijo toma las letras iniciales, con o sin guion', () => {
    assert.equal(getPrefijo('TR-20'), 'TR');
    assert.equal(getPrefijo('CM43'), 'CM');
    assert.equal(getPrefijo('bm09'), 'BM', 'minusculas');
});

test('getPrefijo devuelve vacio cuando no hay letras adelante', () => {
    for (const v of ['', null, undefined, '123', '-01']) assert.equal(getPrefijo(v), '');
});

test('el prefijo manda sobre el TIPO del Excel, que no es confiable', () => {
    // CLAUDE.md: "La columna TIPO del Excel de Equipos no es confiable (a los tractores les
    // dice CAMION)". Esta es la mitad que importa: si alguien invierte el || de
    // getDenominacion(), la denominacion de media flota cambia y hay que enterarse acá.
    assert.equal(getDenominacion('TR20', 'CAMION'), 'TRACTOR C/CABINA');
    assert.equal(getDenominacion('MX108', 'CAMION'), 'MIXER');
    assert.equal(getDenominacion('CM43', ''), 'CAMIONETA');
});

test('getDenominacion cae al TIPO del Excel solo cuando el prefijo no esta mapeado', () => {
    // No perder informacion de un equipo nuevo o atipico.
    assert.equal(getDenominacion('ZZ99', 'Retroexcavadora'), 'RETROEXCAVADORA');
    assert.equal(getDenominacion('ZZ99', ''), 'SIN CLASIFICAR');
});

// --- bandera y lugar ----------------------------------------------------------------------

test('getBandera separa los combustibles de sede propia de los de estacion', () => {
    assert.equal(getBandera('INFINIA DIESEL'), 'YPF');
    assert.equal(getBandera('YPF 500'), 'YPF');
    assert.equal(getBandera('QUANTIUM DIESEL'), 'Axion');
    assert.equal(getBandera('NAFTA SUPER'), 'Axion');
});

test('getBandera no adivina: un combustible desconocido queda sin bandera', () => {
    assert.equal(getBandera('GASOIL COMUN'), '');
    assert.equal(getBandera(''), '');
});

test('tipoLugarCarga marca como Sede lo que no esta en la lista de estaciones', () => {
    // Default conservador a proposito: no marcar de mas.
    assert.equal(tipoLugarCarga('GRIS'), 'Estación de servicio');
    assert.equal(tipoLugarCarga('EE SS Coronel Diaz'), 'Estación de servicio');
    assert.equal(tipoLugarCarga('Godoy Cruz'), 'Sede');
    assert.equal(tipoLugarCarga(''), '');
});

test('getProvincia reconoce las dos provincias de la operacion', () => {
    assert.equal(getProvincia('Godoy Cruz, Mendoza'), 'MENDOZA');
    assert.equal(getProvincia('San Juan'), 'SAN JUAN');
});

// --- clave de cruce -----------------------------------------------------------------------

test('normalizeEquipoKey quita separadores y el cero de relleno, para poder cruzar', () => {
    assert.equal(normalizeEquipoKey('BM-09'), 'BM9');
    assert.equal(normalizeEquipoKey('BM 09'), 'BM9');
    assert.equal(normalizeEquipoKey('BM09'), 'BM9');
    assert.equal(normalizeEquipoKey('bm_09'), 'BM9');
});

test('normalizeEquipoKey deja las tres formas del mismo equipo en una sola clave', () => {
    const formas = ['TR-20', 'TR 20', 'tr20', 'TR020'];
    const claves = new Set(formas.map(normalizeEquipoKey));
    assert.equal(claves.size, 1, `deberian colapsar a una sola clave: ${[...claves]}`);
});

test('normalizeEquipoKey no come un cero que es parte del numero', () => {
    assert.equal(normalizeEquipoKey('TR-10'), 'TR10', '10 no es 1');
    assert.equal(normalizeEquipoKey('CM100'), 'CM100');
});

test('normalizeEquipoKey devuelve vacio ante nulos', () => {
    for (const v of ['', null, undefined]) assert.equal(normalizeEquipoKey(v), '');
});

test('identidadTexto conserva el cero de relleno: es para mostrar, no para cruzar', () => {
    assert.equal(identidadTexto('BM-09', 'JNU 923'), 'BM09 JNU923');
    assert.equal(identidadTexto('BM07', ''), 'BM07');
    assert.equal(identidadTexto('', 'JNU923'), 'JNU923');
    assert.equal(identidadTexto('', ''), '');
});

// --- clasificarIdentificador ---------------------------------------------------------------

test('clasificarIdentificador reconoce la patente vieja de tres letras y tres numeros', () => {
    assert.deepEqual(clasificarIdentificador('JNU923'), { tipo: 'dominio', valor: 'JNU923' });
    assert.deepEqual(clasificarIdentificador('HHA905'), { tipo: 'dominio', valor: 'HHA905' });
});

test('clasificarIdentificador reconoce la patente Mercosur', () => {
    assert.deepEqual(clasificarIdentificador('AF809IC'), { tipo: 'dominio', valor: 'AF809IC' });
    assert.deepEqual(clasificarIdentificador('AD031FG'), { tipo: 'dominio', valor: 'AD031FG' });
});

test('clasificarIdentificador limpia el espacio de sobra de una patente', () => {
    assert.deepEqual(clasificarIdentificador('OXZ 911'), { tipo: 'dominio', valor: 'OXZ911' });
    assert.deepEqual(clasificarIdentificador('AB 205 QO'), { tipo: 'dominio', valor: 'AB205QO' });
});

test('clasificarIdentificador reconoce el interno de la flota', () => {
    assert.deepEqual(clasificarIdentificador('TR20'), { tipo: 'interno', valor: 'TR20' });
    assert.deepEqual(clasificarIdentificador('AE01'), { tipo: 'interno', valor: 'AE01' });
});

test('un token con guion nunca es patente: las de esta flota no llevan guion', () => {
    // El bug: "MX-108-VL" quedaba "MX108VL" y coincidia por casualidad con el patron
    // Mercosur (2 letras + 3 numeros + 2 letras), asi que se clasificaba como DOMINIO falso.
    assert.deepEqual(clasificarIdentificador('MX-108-VL'), { tipo: 'interno', valor: 'MX108' });
    assert.deepEqual(clasificarIdentificador('MX-63-TK'), { tipo: 'interno', valor: 'MX63' });
    assert.deepEqual(clasificarIdentificador('BM-09'), { tipo: 'interno', valor: 'BM09' });
});

test('clasificarIdentificador marca vacio y desconocido en vez de adivinar', () => {
    assert.equal(clasificarIdentificador('').tipo, 'vacio');
    assert.equal(clasificarIdentificador(null).tipo, 'vacio');
    assert.equal(clasificarIdentificador('   ').tipo, 'vacio');
    assert.equal(clasificarIdentificador('PORTATIL').tipo, 'desconocido');
});

// --- extraerIdentidad ----------------------------------------------------------------------

test('extraerIdentidad parte una celda que trae interno y patente juntos', () => {
    const r = extraerIdentidad('BM09 JNU923');
    assert.equal(r.interno, 'BM09');
    assert.equal(r.dominio, 'JNU923');
    assert.equal(r.interno_key, 'BM9');
});

test('extraerIdentidad no parte una patente que solo tiene un espacio de mas', () => {
    // El bug: dividir siempre por espacio primero rompia "OXZ 911" en "OXZ" + "911",
    // que por separado no calificaban como nada.
    const r = extraerIdentidad('OXZ 911');
    assert.equal(r.dominio, 'OXZ911');
    assert.ok(!r.interno, `no deberia haber interno, quedo "${r.interno}"`);
});

test('extraerIdentidad arma la identidad desde columnas separadas', () => {
    const r = extraerIdentidad('TR-21', 'AD291BF');
    assert.equal(r.interno, 'TR21');
    assert.equal(r.dominio, 'AD291BF');
});

test('extraerIdentidad resuelve la identidad "INTERNO DOMINIO" de la Fase 7', () => {
    const r = extraerIdentidad('TR-21 AD291BF');
    assert.equal(r.interno, 'TR21');
    assert.equal(r.dominio, 'AD291BF');
});

test('extraerIdentidad guarda las dos claves normalizadas, que es lo que hace cruzar', () => {
    const porInterno = extraerIdentidad('BM-09');
    const porPatente = extraerIdentidad('JNU923');
    assert.equal(porInterno.interno_key, 'BM9');
    assert.ok(porPatente.dominio_key, 'una fila que solo trae patente igual debe tener clave');
});

test('extraerIdentidad no se cae con celdas vacias', () => {
    const r = extraerIdentidad('', null, undefined);
    assert.ok(!r.interno);
    assert.ok(!r.dominio);
});

// --- correcciones confirmadas --------------------------------------------------------------

test('corregirCodigoConocido aplica las dos correcciones confirmadas por HSV', () => {
    // GR01: un chofer tipeo GR01 en vez de GE01 esa semana. TP0101: un cero de mas.
    assert.equal(corregirCodigoConocido('GR01'), 'GE01');
    assert.equal(corregirCodigoConocido('TP0101'), 'TP01');
});

test('corregirCodigoConocido normaliza antes de comparar', () => {
    assert.equal(corregirCodigoConocido('gr-01'), 'GE01');
    assert.equal(corregirCodigoConocido('GR 01'), 'GE01');
});

test('corregirCodigoConocido deja intacto todo lo demas', () => {
    assert.equal(corregirCodigoConocido('TR20'), 'TR20');
    assert.equal(corregirCodigoConocido('GE01'), 'GE01');
    assert.equal(corregirCodigoConocido('TP01'), 'TP01');
    assert.equal(corregirCodigoConocido(''), '');
});

test('corregirCaloventorPorLugar resuelve la sede por el lugar de carga de la misma fila', () => {
    // HSV tiene un caloventor por sede: el lugar alcanza para saber cual, sin ambiguedad.
    assert.equal(corregirCaloventorPorLugar('CALOVENTOR', 'Godoy Cruz'), 'CL02');
    assert.equal(corregirCaloventorPorLugar('MANTENIMIENTO', 'Tunuyán'), 'CL03');
    assert.equal(corregirCaloventorPorLugar('SURTIDOR', 'San Martín'), 'CL04');
});

test('corregirCaloventorPorLugar no corrige si el lugar no identifica una sede', () => {
    assert.equal(corregirCaloventorPorLugar('CALOVENTOR', 'GRIS'), 'CALOVENTOR');
    assert.equal(corregirCaloventorPorLugar('CALOVENTOR', ''), 'CALOVENTOR');
});

test('corregirCaloventorPorLugar no toca un interno que si es un equipo rodante', () => {
    assert.equal(corregirCaloventorPorLugar('TR20', 'Godoy Cruz'), 'TR20');
    assert.equal(corregirCaloventorPorLugar('MX108', 'Tunuyán'), 'MX108');
});

// --- sugerencia de typo (no corrige sola) --------------------------------------------------

test('sugerirPosibleTypo propone el interno real mas parecido con prefijo desconocido', () => {
    assert.equal(sugerirPosibleTypo('XY01', ['XX01', 'TR20']), 'XX01');
});

test('sugerirPosibleTypo se calla cuando el prefijo ya es conocido', () => {
    // Por eso TP0101 necesitaba una correccion confirmada aparte: TP es un prefijo valido.
    assert.equal(sugerirPosibleTypo('TR99', ['TR20', 'TR21']), null);
});

test('sugerirPosibleTypo se calla si el prefijo ya aparece en internosReales, aunque no este en TIPO_POR_PREFIJO', () => {
    // El test de arriba (TR99) ejercita solo la primera mitad del ||: TR ya esta en
    // TIPO_POR_PREFIJO y hay cortocircuito. ZZ no esta mapeado, pero ZZ01 ya figura en
    // internosReales con el mismo prefijo: aca decide el .some() de la segunda mitad. Si esa
    // clausula se rompiera, 'ZZ2' y 'ZZ1' (claves normalizadas) quedan a una edicion de
    // distancia y la funcion devolveria 'ZZ01' como sugerencia falsa sobre un equipo que ya
    // existe.
    assert.equal(sugerirPosibleTypo('ZZ02', ['ZZ01']), null);
});

test('sugerirPosibleTypo no sugiere nada cuando la diferencia es de dos o mas ediciones', () => {
    assert.equal(sugerirPosibleTypo('ZZ99', ['XX01', 'TR20']), null);
});

test('sugerirPosibleTypo devuelve null ante un codigo vacio', () => {
    for (const v of ['', null, undefined]) assert.equal(sugerirPosibleTypo(v, ['TR20']), null);
});

// --- claves de duplicado exacto --------------------------------------------------------------

// Los nombres de campo son los que lee claveCargaExacta: precio_unitario y lugar_carga, NO
// precio ni lugar. Con los nombres equivocados esas dos componentes quedan siempre vacias y
// el test no prueba que participen de la clave.
const CARGA = {
    interno_key: 'TR20', fecha: '2026-03-15', litros: 197, importe: 472800,
    precio_unitario: 2400, combustible: 'INFINIA DIESEL', lugar_carga: 'Godoy Cruz',
    centro_costo: 'CC1', chofer: 'Perez'
};

test('claveCargaExacta coincide para la misma fila entrada dos veces', () => {
    assert.equal(claveCargaExacta(CARGA), claveCargaExacta({ ...CARGA }));
});

test('las nueve componentes participan: cambiar cualquiera parte la clave', () => {
    // Dos cargas reales del mismo equipo el mismo dia no coinciden hasta el centavo y el litro
    // con un decimal. Si una componente dejara de contar, dos cargas legitimas se verian como
    // la misma y una se descartaria al importar — litros que desaparecen sin aviso.
    const distintas = {
        interno_key: 'TR21', fecha: '2026-03-16', litros: 198, importe: 472801,
        precio_unitario: 2401, combustible: 'YPF 500', lugar_carga: 'Tunuyán',
        centro_costo: 'CC2', chofer: 'Gomez'
    };
    for (const [campo, valor] of Object.entries(distintas)) {
        assert.notEqual(
            claveCargaExacta(CARGA), claveCargaExacta({ ...CARGA, [campo]: valor }),
            `cambiar ${campo} no cambio la clave`
        );
    }
});

test('claveCargaExacta redondea el importe al centavo y los litros al decimo', () => {
    // Es la tolerancia declarada: por debajo de eso es ruido de coma flotante, no otra carga.
    assert.equal(claveCargaExacta(CARGA), claveCargaExacta({ ...CARGA, importe: 472800.001 }));
    assert.notEqual(claveCargaExacta(CARGA), claveCargaExacta({ ...CARGA, importe: 472800.01 }));
});

test('claveGpsExacta coincide para el mismo reporte mensual importado dos veces', () => {
    const g = {
        interno_key: 'MX108', fecha: '2026-01-01', fecha_hasta: '2026-01-31',
        distancia: 766.4, horas: { ralenti: 10.5, movimiento: 29.6, parado: 0 }
    };
    assert.equal(claveGpsExacta(g), claveGpsExacta({ ...g, horas: { ...g.horas } }));
});

test('claveGpsExacta distingue dos meses distintos del mismo equipo', () => {
    const enero = {
        interno_key: 'MX108', fecha: '2026-01-01', fecha_hasta: '2026-01-31',
        distancia: 766.4, horas: { ralenti: 10.5, movimiento: 29.6, parado: 0 }
    };
    const febrero = { ...enero, fecha: '2026-02-01', fecha_hasta: '2026-02-28' };
    assert.notEqual(claveGpsExacta(enero), claveGpsExacta(febrero));
});

test('claveGpsExacta no se cae cuando falta el objeto horas', () => {
    assert.doesNotThrow(() => claveGpsExacta({ interno_key: 'MX108', fecha: '2026-01-01' }));
});

// --- slugCampo ------------------------------------------------------------------------------

test('slugCampo produce una clave estable a partir del nombre de una columna', () => {
    // Valores literales: comparar slugCampo(a) contra slugCampo(b) deriva la expectativa de la
    // propia funcion, asi que una implementacion que devuelve siempre la misma constante pasa.
    assert.equal(slugCampo('COSTO TOTAL ($)'), 'costo_total');
    assert.equal(slugCampo('Tiempo en ralentí'), 'tiempo_en_ralenti');
    assert.equal(slugCampo('costo total ($)'), 'costo_total', 'no depende del capitalizado');
});
