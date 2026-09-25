/**
 * Decisiones cerradas del proyecto que no se pueden verificar leyendo una funcion, pero que
 * se rompen en silencio. Un test es el unico lugar donde una decision asi sobrevive a que
 * nadie se acuerde de por que estaba tomada.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

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

test('el service worker precachea todos los modulos de js/ y las hojas de styles/', () => {
    // La app es una PWA y el service worker sirve JS y CSS PRIMERO desde cache. Un archivo que no este en
    // PRECACHE solo queda disponible offline despues de pedirse una vez con internet: agregar un modulo
    // nuevo (como js/data/alcance.js) y olvidarse de sumarlo es el error que este test impide.
    const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
    const listados = new Set([...sw.matchAll(/'\.\/((?:js|styles)\/[^']+\.(?:js|css))'/g)].map(m => m[1]));
    const enDisco = ['js', 'styles']
        .flatMap(dir => readdirSync(new URL(`../${dir}/`, import.meta.url), { recursive: true })
            .map(f => `${dir}/${String(f).replace(/\\/g, '/')}`))
        .filter(f => /\.(js|css)$/.test(f));
    assert.ok(enDisco.length > 20, `se esperaban muchos archivos, hubo ${enDisco.length}`);
    const faltan = enDisco.filter(f => !listados.has(f));
    assert.deepEqual(faltan, [], `no estan en PRECACHE de sw.js: ${faltan.join(', ')}`);
});

test('la version del cache del service worker no volvio a la de antes de estos cambios', () => {
    // El SW usa cache primero: sin subir CACHE_VERSION, quien ya visito la app NO vuelve a bajar el JS ni
    // el CSS nuevos, y ve la version vieja para siempre. Estuvo en 'flotacontrol-v2' desde la Fase 7 mientras
    // el codigo cambiaba. Subir el numero en cada release; este test impide volver atras.
    const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
    const version = Number(/CACHE_VERSION = 'flotacontrol-v(\d+)'/.exec(sw)?.[1]);
    assert.ok(version >= 3, `CACHE_VERSION esta en v${version}`);
});
