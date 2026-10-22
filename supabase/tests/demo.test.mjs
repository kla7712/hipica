import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth; create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated;
`);
for (const f of process.argv.slice(2).sort()) await db.exec(readFileSync(f, 'utf8'));
const A = '00000000-0000-0000-0000-0000000000d1', F = '00000000-0000-0000-0000-0000000000d2';
await db.query(`insert into auth.users values ($1, 'demo-admin@example.com'), ($2, 'demo-familia@example.com')`, [A, F]);
let ok = 0, fail = 0;
const check = (n, c, x = '') => { c ? ok++ : fail++; console.log((c ? '  OK   ' : '  FAIL ') + n + ' ' + (c ? '' : x)); };
async function as(uid, sql, p = []) {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
  await db.exec(uid ? 'set role authenticated' : 'set role anon');
  try { return await db.query(sql, p); } finally { await db.exec('reset role'); }
}
const root = async (sql, p = []) => { await db.query(`select set_config('request.jwt.claim.sub', '', false)`); return db.query(sql, p); };

const h1 = (await root(`select public.reset_demo() as h`)).rows[0].h;
check('reset_demo crea la hípica', !!h1);
const n = (await root(`select count(*)::int n from public.sesiones where hipica_id = $1`, [h1])).rows[0].n;
check('crea sesiones para dos semanas', n >= 10, `(${n})`);
const llenas = (await root(`select count(*)::int n from public.sesiones s where hipica_id = $1 and (select count(*) from public.reservas r where r.sesion_id = s.id) >= s.plazas`, [h1])).rows[0].n;
const vacias = (await root(`select count(*)::int n from public.sesiones s where hipica_id = $1 and not exists (select 1 from public.reservas r where r.sesion_id = s.id)`, [h1])).rows[0].n;
check('hay alguna clase completa', llenas > 0, `(${llenas})`);
console.log(`      sesiones: ${n}, completas: ${llenas}, vacías: ${vacias}`);
const exceso = (await root(`select count(*)::int n from public.sesiones s where (select count(*) from public.reservas r where r.sesion_id = s.id) > s.plazas`)).rows[0].n;
check('ninguna clase supera sus plazas', exceso === 0);
const hor = (await as(F, `select * from public.horario($1, now(), now() + interval '14 days')`, [h1])).rows;
check('la familia ve el horario y reservas de Lucía', hor.some(r => r.mias.length > 0), JSON.stringify(hor.slice(0, 2)));
const jin = (await as(F, `select nombre from public.miembros where hipica_id = $1 order by nombre`, [h1])).rows.map(r => r.nombre);
check('la familia ve a la madre y sus dos hijos', jin.length === 3, JSON.stringify(jin));
await as(A, `select public.crear_hipica('Otra', 'X')`);
await as(A, `update public.hipicas set nombre = 'Cambiada' where id = $1`, [h1]);
const h2 = (await root(`select public.reset_demo() as h`)).rows[0].h;
const total = (await root(`select count(*)::int n from public.hipicas`)).rows[0].n;
check('reset borra la demo anterior y lo que crearon los usuarios demo', total === 1 && h2 !== h1, `(${total})`);
check('el nombre vuelve a su estado original', (await root(`select nombre from public.hipicas where id = $1`, [h2])).rows[0].nombre === 'Hípica La Dehesa');

// Novedades de la escuela (0007)
const cuenta = async (sql, p = [h2]) => (await root(sql, p)).rows[0].n;
check('la demo tiene 3 pistas', await cuenta(`select count(*)::int n from public.pistas where hipica_id = $1`) === 3);
check('la demo tiene caballos, uno en reposo', await cuenta(`select count(*)::int n from public.caballos where hipica_id = $1 and tipo = 'escuela'`) === 8
  && await cuenta(`select count(*)::int n from public.caballos where hipica_id = $1 and not disponible`) === 1);
check('hay clases hoy o mañana', await cuenta(`select count(*)::int n from public.sesiones where hipica_id = $1 and inicio < now() + interval '1 day'`) > 0);
check('hay alguien en lista de espera', await cuenta(`select count(*)::int n from public.esperas where hipica_id = $1`) === 2);
check('hay caballos asignados', await cuenta(`select count(*)::int n from public.reservas where hipica_id = $1 and caballo_id is not null`) > 5);
check('ningún caballo repetido en una clase', await cuenta(`select count(*)::int n from (select sesion_id, caballo_id from public.reservas where hipica_id = $1 and caballo_id is not null group by 1, 2 having count(*) > 1) x`) === 0);
check('hay tablón', await cuenta(`select count(*)::int n from public.avisos where hipica_id = $1`) === 2);
const bf = (await as(F, `select * from public.estado_bonos($1)`, [h2])).rows;
console.log('      bonos familia:', bf.map(b => `${b.nombre} ${b.usadas ?? '-'}/${b.clases ?? '-'}`).join(', '));
check('la familia ve los bonos de Lucía y Pablo', bf.filter(b => b.bono_id).length === 2);
const pab = bf.find(b => b.nombre === 'Pablo López');
check('a Pablo le queda una clase', pab && pab.clases - pab.usadas === 1, JSON.stringify(pab));
const ba = (await as(A, `select * from public.estado_bonos($1)`, [h2])).rows;
check('el admin ve alumnos sin bono y con bono agotado', ba.some(b => !b.bono_id) && ba.some(b => b.bono_id && b.usadas >= b.clases));
const esp = (await as(F, `select * from public.horario($1, now(), now() + interval '14 days')`, [h2])).rows.filter(r => r.esperas.length);
check('la familia ve a Pablo en una lista de espera', esp.length === 1 && esp[0].esperas[0].nombre === 'Pablo López', JSON.stringify(esp.map(e => e.esperas)));

// Propietarios (0008)
const mios = (await as(F, `select nombre, ubicacion from public.caballos`)).rows;
check('la familia ve solo su caballo, Trueno', mios.length === 1 && mios[0].nombre === 'Trueno', JSON.stringify(mios));
check('Trueno tiene cuidados pendientes', (await as(F, `select * from public.cuidados where not hecho`)).rows.length === 3);
check('hay una solicitud pendiente para la hípica', (await as(A, `select * from public.solicitudes where estado = 'pendiente'`)).rows.length === 1);
check('la familia no ve la solicitud de otro propietario', (await as(F, `select * from public.solicitudes where estado = 'pendiente'`)).rows.length === 0);
check('hay 8 servicios', (await as(F, `select * from public.servicios`)).rows.length === 8);

// Cuadra (0009)
check('hay tareas de cuadra', (await as(A, `select * from public.tareas`)).rows.length === 8);
check('el pienso está bajo mínimos', (await as(A, `select * from public.existencias where cantidad < minimo`)).rows.length === 1);
check('hay 2 altas por revisar', (await as(A, `select * from public.altas where estado = 'pendiente'`)).rows.length === 2);
await as(A, `select public.revisar_alta(id, true) from public.altas where nombre = 'Andrés Molina'`);
check('aprobar el alta de demo crea al propietario y su caballo', (await as(A, `select * from public.caballos where nombre = 'Canelo'`)).rows.length === 1);
try { await as(A, `select public.borrar_mi_cuenta()`); check('la cuenta demo no se puede borrar', false); }
catch (e) { check('la cuenta demo no se puede borrar', /demostración/.test(e.message), e.message); }
try { await as(A, `select public.reset_demo()`); check('la app no puede lanzar reset_demo', false); }
catch (e) { check('la app no puede lanzar reset_demo', /permission denied/i.test(e.message), e.message); }
console.log(`\n${ok} correctas, ${fail} fallidas`);
process.exit(fail ? 1 : 0);
