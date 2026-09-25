/**
 * Resolucion automatica de identidad: cuando la evidencia alcanza para corregir un codigo o una
 * patente sin preguntar, y cuando NO alcanza y hay que dejarlo como esta.
 *
 * Lo que se cuida aca es el segundo caso: una correccion automatica equivocada mueve litros de un
 * equipo a otro sin que nadie lo note, asi que cada regla tiene un test de "no toca".
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeEquipoKey } from '../js/data/normalizer.js';
import { proponerTipeo, servicioPorLugar, elegirPatente } from '../js/data/resolucion-identidad.js';

const carga = (interno, lugar, centro) => ({
    type: 'carga', interno, interno_key: normalizeEquipoKey(interno),
    lugar_carga: lugar, centro_costo: centro
});
const maestro = [{ interno: 'GE01' }, { interno: 'GE02' }, { interno: 'TR20' }];

// --- tipeo de un interno real ---------------------------------------------------------------

test('GR01 se corrige a GE01 cuando comparte el lugar de carga', () => {
    const suyas = [carga('GR01', 'ARIDOS', 'AMZA')];
    const todas = [...suyas, carga('GE01', 'ARIDOS', 'AMZA'), carga('GE02', 'ARIDOS', 'AMZA')];
    const r = proponerTipeo('GR01', suyas, todas, maestro);
    assert.equal(r.destino, 'GE01');
    assert.match(r.evidencia, /lugar de carga/);
});

test('un tipeo se corrige tambien si solo coincide el centro de costo', () => {
    const suyas = [carga('GR01', 'OTRO LUGAR', 'AMZA')];
    const todas = [...suyas, carga('GE01', 'ARIDOS', 'AMZA')];
    const r = proponerTipeo('GR01', suyas, todas, maestro);
    assert.equal(r.destino, 'GE01');
    assert.match(r.evidencia, /centro de costo/);
});

test('sin ninguna pista en comun NO se corrige: quedar a una letra no alcanza', () => {
    // Un codigo casi igual a otro puede ser un equipo distinto. Sin lugar ni centro de costo
    // compartidos, la app no adivina.
    const suyas = [carga('GR01', 'TUNUYAN', 'PTY')];
    const todas = [...suyas, carga('GE01', 'ARIDOS', 'AMZA')];
    assert.equal(proponerTipeo('GR01', suyas, todas, maestro), null);
});

test('un codigo que no esta a una letra de ningun interno real no se corrige', () => {
    const suyas = [carga('QQ99', 'ARIDOS', 'AMZA')];
    const todas = [...suyas, carga('GE01', 'ARIDOS', 'AMZA')];
    assert.equal(proponerTipeo('QQ99', suyas, todas, maestro), null);
});

test('un prefijo que ya existe en la flota no es un tipeo (TR21 al lado de TR20 es otro equipo)', () => {
    const suyas = [carga('TR21', 'ARIDOS', 'AMZA')];
    const todas = [...suyas, carga('TR20', 'ARIDOS', 'AMZA')];
    assert.equal(proponerTipeo('TR21', suyas, todas, maestro), null);
});

test('las pistas se comparan sin importar mayusculas ni espacios de mas', () => {
    const suyas = [carga('GR01', 'aridos ', 'amza')];
    const todas = [...suyas, carga('GE01', 'ARIDOS', 'AMZA')];
    assert.equal(proponerTipeo('GR01', suyas, todas, maestro)?.destino, 'GE01');
});

// --- servicio de planta escrito con su nombre -----------------------------------------------

test('LIMPIEZA en Godoy Cruz es LM01', () => {
    assert.equal(servicioPorLugar('LIMPIEZA', 'GODOY CRUZ'), 'LM01');
});

test('CALDERA en Tunuyan es CA01', () => {
    assert.equal(servicioPorLugar('CALDERA', 'TUNUYAN'), 'CA01');
});

test('el servicio sin sede conocida no se resuelve', () => {
    assert.equal(servicioPorLugar('LIMPIEZA', 'SAN JUAN'), null);
    assert.equal(servicioPorLugar('LIMPIEZA', ''), null);
});

test('un codigo que no es un servicio no se toca por lugar', () => {
    assert.equal(servicioPorLugar('TR20', 'GODOY CRUZ'), null);
});

test('la sede se reconoce dentro de un lugar mas largo', () => {
    assert.equal(servicioPorLugar('limpieza', 'Planta Godoy Cruz'), 'LM01');
});

// --- interno con dos patentes ---------------------------------------------------------------

test('gana la patente que declara el maestro aunque sea la minoritaria', () => {
    const d = new Map([['ONK194', 23], ['OKN194', 65]]);
    const r = elegirPatente(d, 'ONK194');
    assert.equal(r.dominio, 'ONK194');
    assert.match(r.motivo, /maestro/);
});

test('sin dato del maestro gana la claramente mayoritaria', () => {
    const r = elegirPatente(new Map([['ONK194', 65], ['OKN194', 23]]));
    assert.equal(r.dominio, 'ONK194');
    assert.match(r.motivo, /mayoritaria \(65 filas contra 23\)/);
});

test('sin mayoria clara no se elige: 12 contra 8 no alcanza', () => {
    assert.equal(elegirPatente(new Map([['AAA111', 12], ['AAA112', 8]])), null);
});

test('la mayoria exacta del doble si alcanza', () => {
    assert.equal(elegirPatente(new Map([['AAA111', 10], ['AAA112', 5]])).dominio, 'AAA111');
});

test('si el maestro declara una patente que ninguna fila trae, se decide por mayoria', () => {
    const r = elegirPatente(new Map([['ONK194', 65], ['OKN194', 23]]), 'ZZZ999');
    assert.equal(r.dominio, 'ONK194');
});

test('una sola patente no hay nada que elegir', () => {
    assert.equal(elegirPatente(new Map([['ONK194', 65]])), null);
});
