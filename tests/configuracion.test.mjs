/**
 * Decisiones cerradas del proyecto que no se pueden verificar leyendo una funcion, pero que
 * se rompen en silencio. Un test es el unico lugar donde una decision asi sobrevive a que
 * nadie se acuerde de por que estaba tomada.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('package.json NO declara "type": "module"', () => {
    // Node imprime en cada corrida un MODULE_TYPELESS_PACKAGE_JSON que aconseja justamente
    // agregarlo. Ese consejo rompe el proyecto: bajo type:module el createRequire() con el que
    // los arneses cargan xlsx.full.min.js (que es UMD) devuelve un objeto vacio, el parseo da
    // 0 filas y `npm run verificar` mide 0 equipos en vez de 189 — SIN lanzar ningun error.
    // El warning tiene forma de recomendacion oficial; esto es lo que impide que alguien
    // (persona o agente) le haga caso.
    assert.equal('type' in pkg, false,
        'Bajo type:module los arneses miden 0 equipos en vez de 189, sin error. Ver _comment.');
});

test('el motivo de no poner type:module sigue escrito en package.json', () => {
    // Si el comentario se pierde, el test de arriba queda sin explicacion y el proximo que lo
    // vea lo va a borrar por "restrictivo".
    assert.match(String(pkg._comment || ''), /type.*module/i);
});

test('no se agregaron dependencias de runtime', () => {
    // La app corre 100% en el navegador con modulos ES y todo vendorizado: una dependencia de
    // runtime implicaria un build, que es la decision que este proyecto no tomo.
    assert.equal('dependencies' in pkg, false, `apareció: ${JSON.stringify(pkg.dependencies)}`);
});

test('npm run probar corre los unit tests primero', () => {
    // Lo barato tiene que fallar antes que lo que tarda minutos y necesita los Excel reales.
    const probar = String(pkg.scripts.probar || '');
    assert.ok(probar.startsWith('npm test'), `probar empieza con: ${probar.slice(0, 40)}`);
    for (const arnes of ['declarados', 'importacion', 'unidades', 'verificar', 'auditar']) {
        assert.ok(probar.includes(arnes), `probar dejo de correr ${arnes}`);
    }
});
