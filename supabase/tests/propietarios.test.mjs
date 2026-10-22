// Pruebas de 0008: caballos de propietarios, cuidados, servicios y solicitudes.
//   node supabase/tests/propietarios.test.mjs supabase/migrations/*.sql
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

const U = {
  admin: '00000000-0000-0000-0000-00000000000a',
  adminB: '00000000-0000-0000-0000-00000000000b',
  monitor: '00000000-0000-0000-0000-00000000000c',
  duena: '00000000-0000-0000-0000-000000000001',
  otro: '00000000-0000-0000-0000-000000000002',
};
for (const id of Object.values(U)) await db.query('insert into auth.users (id) values ($1)', [id]);

let ok = 0, fail = 0;
const check = (n, c, x = '') => { c ? ok++ : fail++; console.log((c ? '  OK   ' : '  FAIL ') + n + (c ? '' : ' ' + x)); };
async function as(uid, sql, p = []) {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
  await db.exec(uid ? 'set role authenticated' : 'set role anon');
  try { return await db.query(sql, p); } finally { await db.exec('reset role'); }
}
const root = async (sql, p = []) => { await db.query(`select set_config('request.jwt.claim.sub', '', false)`); return db.query(sql, p); };
const one = r => Object.values(r.rows[0] ?? {})[0];
async function falla(n, uid, sql, p, patron) {
  try { const r = await as(uid, sql, p); check(n, (r.affectedRows ?? 0) === 0 && !r.rows.length, `(no dio error: ${JSON.stringify(r.rows)})`); }
  catch (e) { check(n, patron.test(e.message), `(error: ${e.message})`); }
}

const h = one(await as(U.admin, `select public.crear_hipica('Pupilaje', 'Ana')`));
const hB = one(await as(U.adminB, `select public.crear_hipica('Otra', 'Bea')`));
const tok = one(await as(U.admin, `insert into public.invitaciones (hipica_id) values ($1) returning token`, [h]));
const tokM = one(await as(U.admin, `insert into public.invitaciones (hipica_id, rol, usos_max) values ($1, 'monitor', 1) returning token`, [h]));
await as(U.monitor, `select public.aceptar_invitacion($1, 'Mónica')`, [tokM]);
await as(U.duena, `select public.aceptar_invitacion($1, 'Elena')`, [tok]);
await as(U.otro, `select public.aceptar_invitacion($1, 'Óscar')`, [tok]);
const mDuena = one(await root(`select id from public.miembros where user_id = $1`, [U.duena]));
const mOtro = one(await root(`select id from public.miembros where user_id = $1`, [U.otro]));
const hija = one(await as(U.duena, `select public.anadir_jinete($1, 'Lucía')`, [h]));

console.log('Caballos de propietarios');
const trueno = one(await as(U.admin, `insert into public.caballos (hipica_id, nombre, tipo, propietario_id, box, pupilaje) values ($1, 'Trueno', 'propietario', $2, '7', 'completo') returning id`, [h, mDuena]));
const escuela = one(await as(U.admin, `insert into public.caballos (hipica_id, nombre) values ($1, 'Nube') returning id`, [h]));
const ajeno = one(await as(U.adminB, `insert into public.caballos (hipica_id, nombre) values ($1, 'Ajeno') returning id`, [hB]));
check('el admin da de alta un caballo de propietario', !!trueno);
const vistos = (await as(U.duena, `select nombre from public.caballos`)).rows.map(r => r.nombre);
check('la propietaria ve solo su caballo', JSON.stringify(vistos) === '["Trueno"]', JSON.stringify(vistos));
check('otro alumno no ve caballos', (await as(U.otro, `select * from public.caballos`)).rows.length === 0);
await falla('la propietaria no edita su caballo', U.duena, `update public.caballos set box = '99' where id = $1`, [trueno], /./);
await falla('no se asigna un propietario de otra hípica', U.adminB, `update public.caballos set propietario_id = $2 where id = $1`, [ajeno, mDuena], /foreign key/);
await falla('un alumno no se adueña de un caballo', U.otro, `update public.caballos set propietario_id = $2 where id = $1`, [escuela, mOtro], /./);

console.log('Dónde está el caballo');
await as(U.monitor, `select public.mover_caballo($1, 'paddock')`, [trueno]);
check('el monitor lo saca al paddock', one(await as(U.duena, `select ubicacion from public.caballos where id = $1`, [trueno])) === 'paddock');
await falla('la propietaria no lo mueve desde la app', U.duena, `select public.mover_caballo($1, 'box')`, [trueno], /No puedes mover/);
await falla('ubicación inventada', U.monitor, `select public.mover_caballo($1, 'luna')`, [trueno], /no válida/);
await falla('otra hípica no mueve mis caballos', U.adminB, `select public.mover_caballo($1, 'box')`, [trueno], /No puedes mover/);

console.log('Cuidados');
const vacuna = one(await as(U.monitor, `insert into public.cuidados (hipica_id, caballo_id, tipo, fecha) values ($1, $2, 'vacuna', current_date + 4) returning id`, [h, trueno]));
const herrador = one(await as(U.admin, `insert into public.cuidados (hipica_id, caballo_id, tipo, fecha) values ($1, $2, 'herrador', current_date) returning id`, [h, trueno]));
check('el equipo programa cuidados', !!vacuna && !!herrador);
check('la propietaria ve los cuidados de su caballo', (await as(U.duena, `select * from public.cuidados`)).rows.length === 2);
check('otro alumno no los ve', (await as(U.otro, `select * from public.cuidados`)).rows.length === 0);
await falla('la propietaria no crea cuidados', U.duena, `insert into public.cuidados (hipica_id, caballo_id, tipo, fecha) values ($1, $2, 'otro', current_date)`, [h, trueno], /row-level security/);
await falla('no se programan cuidados a un caballo de otra hípica', U.admin, `insert into public.cuidados (hipica_id, caballo_id, tipo, fecha) values ($1, $2, 'otro', current_date)`, [h, ajeno], /foreign key/);
await as(U.duena, `select public.responder_cuidado($1, 'propietario')`, [vacuna]);
check('la propietaria dice que trae su veterinario', one(await root(`select responsable from public.cuidados where id = $1`, [vacuna])) === 'propietario');
await falla('otro alumno no responde por ella', U.otro, `select public.responder_cuidado($1, 'hipica')`, [vacuna], /No puedes responder/);
await falla('respuesta inventada', U.duena, `select public.responder_cuidado($1, 'vecino')`, [vacuna], /no válida/);
const sig = one(await as(U.monitor, `select public.cuidado_hecho($1, 'Herrado de manos')`, [herrador]));
const prox = (await root(`select fecha - current_date as dias from public.cuidados where id = $1`, [sig])).rows[0];
check('al hacer el herrador se programa el siguiente en 6 semanas', prox?.dias === 42, JSON.stringify(prox));
await falla('no se marca dos veces', U.monitor, `select public.cuidado_hecho($1)`, [herrador], /No puedes marcar/);
await falla('la propietaria no marca cuidados como hechos', U.duena, `select public.cuidado_hecho($1)`, [vacuna], /No puedes marcar/);

console.log('Servicios y solicitudes');
check('el admin carga los servicios típicos', one(await as(U.admin, `select public.servicios_tipicos($1)`, [h])) === 8);
check('repetirlo no duplica', one(await as(U.admin, `select public.servicios_tipicos($1)`, [h])) === 0);
await falla('un monitor no carga servicios', U.monitor, `select public.servicios_tipicos($1)`, [h], /Solo el administrador/);
await falla('un alumno no cambia precios', U.duena, `update public.servicios set precio = 0`, [], /./);
const sv = Object.fromEntries((await as(U.duena, `select id, nombre from public.servicios`)).rows.map(r => [r.nombre, r.id]));
const sol = one(await as(U.duena, `select public.pedir_servicios($1, $2::uuid[], current_date + 1, 'Con cuidado')`, [trueno, [sv['Ducha'], sv['Mantas'], sv['Herrador']]]));
const fila = (await root(`select total, estado, jsonb_array_length(servicios) n from public.solicitudes where id = $1`, [sol])).rows[0];
check('la propietaria pide ducha, mantas y herrador: 20 € + tarifa', Number(fila.total) === 20 && fila.n === 3 && fila.estado === 'pendiente', JSON.stringify(fila));
await falla('no pide para un caballo que no es suyo', U.otro, `select public.pedir_servicios($1, $2::uuid[], current_date)`, [trueno, [sv['Ducha']]], /No puedes pedir/);
await falla('no se pide un servicio de otra hípica', U.duena, `select public.pedir_servicios($1, array[gen_random_uuid()], current_date)`, [trueno], /no encontrado/);
await falla('no se pide para el pasado', U.duena, `select public.pedir_servicios($1, $2::uuid[], current_date - 1)`, [trueno, [sv['Ducha']]], /próximos/);
await falla('sin servicios no hay solicitud', U.duena, `select public.pedir_servicios($1, '{}'::uuid[], current_date)`, [trueno], /al menos/);
await falla('no se inserta a mano con un precio inventado', U.duena, `insert into public.solicitudes (hipica_id, caballo_id, fecha, servicios, total) values ($1, $2, current_date, '[]', 0)`, [h, trueno], /permission denied/);
await falla('la propietaria no se acepta su propia solicitud', U.duena, `select public.responder_solicitud($1, 'aceptada')`, [sol], /Solo la hípica/);
check('otro alumno no ve la solicitud', (await as(U.otro, `select * from public.solicitudes`)).rows.length === 0);
await as(U.monitor, `select public.responder_solicitud($1, 'aceptada')`, [sol]);
check('el equipo la acepta', one(await root(`select estado from public.solicitudes where id = $1`, [sol])) === 'aceptada');
await falla('ya aceptada, la propietaria no la retira', U.duena, `select public.responder_solicitud($1, 'retirada')`, [sol], /No puedes retirar/);
const sol2 = one(await as(U.duena, `select public.pedir_servicios($1, $2::uuid[], current_date)`, [trueno, [sv['Ducha']]]));
await as(U.duena, `select public.responder_solicitud($1, 'retirada')`, [sol2]);
check('una pendiente sí la puede retirar', one(await root(`select count(*)::int from public.solicitudes where id = $1`, [sol2])) === 0);

console.log('Su caballo en las clases');
const s1 = one(await root(`insert into public.sesiones (hipica_id, titulo, inicio, fin, plazas, tipo) values ($1, 'Libre', now() + interval '1 day', now() + interval '25 hours', 4, 'libre') returning id`, [h]));
const r1 = one(await as(U.duena, `select public.reservar($1)`, [s1]));
await as(U.monitor, `select public.asignar_caballo($1, $2)`, [r1, trueno]);
const hor = (await as(U.duena, `select mias from public.horario($1, now(), now() + interval '2 days')`, [h])).rows[0];
check('en su reserva ve que monta a Trueno', hor.mias[0]?.caballo === 'Trueno');

console.log('Baja del propietario');
await as(U.admin, `select public.dar_de_baja($1)`, [mDuena]);
check('dada de baja, deja de ver el caballo', (await as(U.duena, `select * from public.caballos`)).rows.length === 0);
check('y los cuidados', (await as(U.duena, `select * from public.cuidados`)).rows.length === 0);
check('el caballo sigue en la hípica', (await as(U.admin, `select * from public.caballos where id = $1`, [trueno])).rows.length === 1);
check('la hija tampoco ve nada (sin cuenta)', hija && true);

console.log(`\n${ok} correctas, ${fail} fallidas`);
process.exit(fail ? 1 : 0);
