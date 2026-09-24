/**
 * Resolucion de un registro contra el maestro: doble clave interno + dominio.
 *
 * indexarMaestro()/resolverEquipo() son la pieza que hace que un registro que solo trae
 * patente igual encuentre su ficha. La asimetria entre como se indexa el interno y como se
 * indexa el dominio no es un detalle: decide quien gana cuando dos filas del maestro
 * comparten una clave por un error de tipeo.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { indexarMaestro, resolverEquipo } from '../js/data/analyzer.js';

test('resolverEquipo encuentra el equipo por interno solamente', () => {
    const idx = indexarMaestro([{ interno: 'TR20', dominio: 'JNU923' }]);
    assert.equal(resolverEquipo({ interno: 'TR20' }, idx).interno, 'TR20');
});

test('resolverEquipo encuentra el equipo por dominio cuando el registro no trae interno', () => {
    const idx = indexarMaestro([{ interno: 'TR20', dominio: 'JNU923' }]);
    assert.equal(resolverEquipo({ dominio: 'JNU923' }, idx).interno, 'TR20');
});

test('resolverEquipo prioriza el interno sobre el dominio cuando entran en conflicto', () => {
    // TR21 tiene declarado el dominio AAA111. Un registro con interno TR20 y ese mismo
    // dominio (error de tipeo en la patente en alguna planilla) tiene que resolver a TR20.
    const equipos = [{ interno: 'TR20', dominio: 'JNU923' }, { interno: 'TR21', dominio: 'AAA111' }];
    const idx = indexarMaestro(equipos);
    assert.equal(resolverEquipo({ interno: 'TR20', dominio: 'AAA111' }, idx).interno, 'TR20');
});

test('resolverEquipo devuelve null cuando ni el interno ni el dominio matchean', () => {
    const idx = indexarMaestro([{ interno: 'TR20', dominio: 'JNU923' }]);
    assert.equal(resolverEquipo({ interno: 'ZZ99', dominio: 'ZZZ999' }, idx), null);
});

test('resolverEquipo cae a normalizeEquipoKey cuando falta la clave ya normalizada', () => {
    // Sin interno_key/dominio_key en el registro, las dos funciones normalizan el string
    // crudo para que 'tr-20' y 'TR20' sigan siendo el mismo equipo.
    const idx = indexarMaestro([{ interno: 'TR20' }]);
    assert.equal(resolverEquipo({ interno: 'tr-20' }, idx).interno, 'TR20');
});

test('el interno pisa una clave repetida sin chequear si ya estaba ocupada', () => {
    // Asimetria real del indice: el interno se setea siempre, sin comprobar si la clave ya
    // estaba tomada. Dos equipos con el mismo interno (dato sucio del maestro) hacen que gane
    // el ULTIMO, no el primero.
    const equipos = [{ interno: 'TR20', id: 1 }, { interno: 'TR20', id: 2 }];
    const idx = indexarMaestro(equipos);
    assert.equal(resolverEquipo({ interno: 'TR20' }, idx).id, 2);
});

test('un dominio repetido NO pisa al equipo que ya ocupa esa clave: gana el primero', () => {
    // El espejo del test anterior: el dominio si chequea si la clave ya esta ocupada antes de
    // indexar, a diferencia del interno.
    const equipos = [{ interno: 'A01', dominio: 'X01' }, { interno: 'B01', dominio: 'X01' }];
    const idx = indexarMaestro(equipos);
    assert.equal(resolverEquipo({ dominio: 'X01' }, idx).interno, 'A01');
});

test('indexarMaestro de una lista vacia (o sin argumento) es un Map vacio', () => {
    assert.equal(indexarMaestro([]).size, 0);
    assert.equal(indexarMaestro().size, 0);
});

test('indexarMaestro usa interno_key ya normalizado en vez de recalcularlo de interno', () => {
    // Si interno_key ya viene calculado (registro que ya paso por normalizacion en otra
    // etapa), hay que confiar en el, no reconstruirlo desde el campo interno crudo — que en
    // ese mismo registro puede traer otra forma o estar vacio.
    const idx = indexarMaestro([{ interno: 'cualquier-cosa-no-normalizada', interno_key: 'TR20', dominio: 'JNU923' }]);
    assert.equal(resolverEquipo({ interno_key: 'TR20' }, idx).dominio, 'JNU923');
});

test('indexarMaestro respeta que el interno_key pisa sin chequear y el dominio_key no, tambien con las claves ya normalizadas', () => {
    // Mismo caso que "un dominio repetido NO pisa..." pero armado con interno_key/dominio_key
    // ya calculados en vez de interno/dominio crudos. Con un solo equipo, intercambiar de que
    // campo sale ik y de cual dk no se nota (las dos claves terminan apuntando al mismo
    // objeto). Hace falta un CONFLICTO entre dos equipos para que la asimetria se vea: si se
    // intercambiaran las fuentes, el dominio_key repetido pasaria a comportarse como el
    // interno (pisa sin chequear) y ganaria el ULTIMO equipo en vez del primero.
    const equipos = [
        { interno_key: 'TR20', dominio_key: 'JNU923' },
        { interno_key: 'TR21', dominio_key: 'JNU923' }
    ];
    const idx = indexarMaestro(equipos);
    assert.equal(resolverEquipo({ dominio_key: 'JNU923' }, idx).interno_key, 'TR20', 'gana el primero');
});

test('resolverEquipo lee interno_key/dominio_key ya normalizados, no solo interno/dominio crudo', () => {
    // Mismo conflicto que "prioriza el interno sobre el dominio", pero con las claves YA
    // normalizadas en el registro entrante (el caso real: un registro que llega desde otra
    // etapa del pipeline con las claves precalculadas, no con interno/dominio crudos).
    const equipos = [{ interno_key: 'TR20', dominio_key: 'JNU923' }, { interno_key: 'TR21', dominio_key: 'AAA111' }];
    const idx = indexarMaestro(equipos);
    assert.equal(resolverEquipo({ interno_key: 'TR20', dominio_key: 'AAA111' }, idx).interno_key, 'TR20');
});

test('indexarMaestro no indexa un equipo sin interno ni dominio bajo una clave vacia', () => {
    // ik/dk normalizan a '' cuando faltan los dos campos. Sin las guardas `if (ik)` /
    // `if (dk && !idx.has(dk))`, ese '' se cuela como clave real al Map — un dato sucio del
    // maestro (fila vacia en el Excel de Equipos) no deberia crear una entrada resoluble.
    const idx = indexarMaestro([{ id: 'sin-identidad' }]);
    assert.equal(idx.has(''), false);
    assert.equal(idx.size, 0);
});
