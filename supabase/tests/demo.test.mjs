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
try { await as(A, `select public.borrar_mi_cuenta()`); check('la cuenta demo no se puede borrar', false); }
catch (e) { check('la cuenta demo no se puede borrar', /demostración/.test(e.message), e.message); }
try { await as(A, `select public.reset_demo()`); check('la app no puede lanzar reset_demo', false); }
catch (e) { check('la app no puede lanzar reset_demo', /permission denied/i.test(e.message), e.message); }
console.log(`\n${ok} correctas, ${fail} fallidas`);
process.exit(fail ? 1 : 0);
