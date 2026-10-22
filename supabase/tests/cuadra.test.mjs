// Pruebas de 0009: rol de cuadra, tareas, almacén, profesionales y altas.
//   node supabase/tests/cuadra.test.mjs supabase/migrations/*.sql
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
  mozo: '00000000-0000-0000-0000-00000000000d',
  alumno: '00000000-0000-0000-0000-000000000001',
  nueva: '00000000-0000-0000-0000-000000000002',
  otra: '00000000-0000-0000-0000-000000000003',
  tercera: '00000000-0000-0000-0000-000000000004',
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
  try { const r = await as(uid, sql, p); check(n, (r.affectedRows ?? 0) === 0 && !r.rows.length, `(no dio error: ${JSON.stringify(r.rows).slice(0, 200)})`); }
  catch (e) { check(n, patron.test(e.message), `(error: ${e.message})`); }
}

const h = one(await as(U.admin, `select public.crear_hipica('Cuadra', 'Ana')`));
const hB = one(await as(U.adminB, `select public.crear_hipica('Otra', 'Bea')`));
const tokA = one(await as(U.admin, `insert into public.invitaciones (hipica_id) values ($1) returning token`, [h]));
const tokM = one(await as(U.admin, `insert into public.invitaciones (hipica_id, rol, usos_max) values ($1, 'monitor', 1) returning token`, [h]));
const tokC = one(await as(U.admin, `insert into public.invitaciones (hipica_id, rol, usos_max) values ($1, 'cuadra', 1) returning token`, [h]));
await as(U.monitor, `select public.aceptar_invitacion($1, 'Mónica')`, [tokM]);
await as(U.mozo, `select public.aceptar_invitacion($1, 'Rafa')`, [tokC]);
await as(U.alumno, `select public.aceptar_invitacion($1, 'Álex')`, [tokA]);
const mAlumno = one(await root(`select id from public.miembros where user_id = $1`, [U.alumno]));
check('el mozo entra con rol de cuadra', one(await root(`select rol::text from public.miembros where user_id = $1`, [U.mozo])) === 'cuadra');

console.log('Lo que ve la gente de cuadra');
const caballo = one(await as(U.admin, `insert into public.caballos (hipica_id, nombre, tipo, propietario_id) values ($1, 'Trueno', 'propietario', $2) returning id`, [h, mAlumno]));
await as(U.admin, `update public.miembros set telefono = '666' where id = $1`, [mAlumno]);
check('ve los caballos', (await as(U.mozo, `select * from public.caballos`)).rows.length === 1);
await as(U.mozo, `select public.mover_caballo($1, 'paddock')`, [caballo]);
check('mueve un caballo al paddock', one(await root(`select ubicacion from public.caballos where id = $1`, [caballo])) === 'paddock');
const cuidado = one(await as(U.mozo, `insert into public.cuidados (hipica_id, caballo_id, tipo, fecha) values ($1, $2, 'herrador', current_date) returning id`, [h, caballo]));
await as(U.mozo, `select public.cuidado_hecho($1)`, [cuidado]);
check('marca el herrador como hecho', one(await root(`select hecho from public.cuidados where id = $1`, [cuidado])) === true);
check('no ve las fichas de los alumnos ni sus teléfonos', (await as(U.mozo, `select * from public.miembros where rol = 'alumno'`)).rows.length === 0);
check('sí ve a sus compañeros del equipo', (await as(U.mozo, `select * from public.miembros where rol <> 'alumno'`)).rows.length === 3);
check('no ve las reservas', (await as(U.mozo, `select * from public.reservas`)).rows.length === 0);
check('no ve los bonos', (await as(U.mozo, `select * from public.estado_bonos($1)`, [h])).rows.length === 0);
await falla('no crea clases', U.mozo, `insert into public.clases (hipica_id, titulo, dia_semana, hora_inicio, plazas) values ($1, 'X', 1, '10:00', 4)`, [h], /row-level security/);
await falla('no se cambia el rol', U.mozo, `update public.miembros set rol = 'admin' where user_id = auth.uid()`, [], /Solo un administrador/);
await falla('no da de alta caballos', U.mozo, `insert into public.caballos (hipica_id, nombre) values ($1, 'X')`, [h], /row-level security/);
const servicio = one(await as(U.admin, `insert into public.servicios (hipica_id, nombre, precio) values ($1, 'Ducha', 5) returning id`, [h]));
const sol = one(await as(U.alumno, `select public.pedir_servicios($1, array[$2]::uuid[], current_date)`, [caballo, servicio]));
await falla('no acepta solicitudes de servicios', U.mozo, `select public.responder_solicitud($1, 'aceptada')`, [sol], /Solo la hípica/);
await as(U.monitor, `select public.responder_solicitud($1, 'aceptada')`, [sol]);
await as(U.mozo, `select public.responder_solicitud($1, 'hecha')`, [sol]);
check('marca como hecho un servicio aceptado', one(await root(`select estado from public.solicitudes where id = $1`, [sol])) === 'hecha');

console.log('Tareas de cuadra');
const tarea = one(await as(U.mozo, `insert into public.tareas (hipica_id, titulo, turno) values ($1, 'Toma de pienso', 'manana') returning id`, [h]));
check('el equipo crea tareas', !!tarea);
await as(U.mozo, `select public.marcar_tarea($1, current_date, true)`, [tarea]);
const hecha = (await as(U.admin, `select * from public.tareas_hechas`)).rows[0];
check('el mozo marca la tarea y queda quién la hizo', hecha && hecha.hecha_por === one(await root(`select id from public.miembros where user_id = $1`, [U.mozo])));
await as(U.mozo, `select public.marcar_tarea($1, current_date, true)`, [tarea]);
check('marcarla dos veces no duplica', one(await root(`select count(*)::int from public.tareas_hechas`)) === 1);
await as(U.monitor, `select public.marcar_tarea($1, current_date, false)`, [tarea]);
check('se puede desmarcar', one(await root(`select count(*)::int from public.tareas_hechas`)) === 0);
await falla('no se marca una tarea de hace un mes', U.mozo, `select public.marcar_tarea($1, current_date - 30, true)`, [tarea], /Fecha no válida/);
check('un alumno no ve las tareas', (await as(U.alumno, `select * from public.tareas`)).rows.length === 0);
await falla('un alumno no marca tareas', U.alumno, `select public.marcar_tarea($1, current_date, true)`, [tarea], /No puedes marcar/);
await falla('otra hípica no marca mis tareas', U.adminB, `select public.marcar_tarea($1, current_date, true)`, [tarea], /No puedes marcar/);
await falla('no se escribe a mano en tareas hechas', U.mozo, `insert into public.tareas_hechas (tarea_id, hipica_id, fecha) values ($1, $2, current_date)`, [tarea, h], /permission denied/);
await falla('días de la semana inventados', U.mozo, `insert into public.tareas (hipica_id, titulo, dias) values ($1, 'X', '{8}')`, [h], /check/);

console.log('Almacén');
const pienso = one(await as(U.admin, `insert into public.existencias (hipica_id, nombre, unidad, cantidad, minimo) values ($1, 'Pienso', 'sacos', 6, 10) returning id`, [h]));
await falla('el mozo no crea productos', U.mozo, `insert into public.existencias (hipica_id, nombre) values ($1, 'X')`, [h], /row-level security/);
await falla('el mozo no cambia el mínimo', U.mozo, `update public.existencias set minimo = 0 where id = $1`, [pienso], /./);
check('el mozo resta 2 sacos', Number(one(await as(U.mozo, `select public.ajustar_existencia($1, -2)`, [pienso]))) === 4);
check('no baja de cero', Number(one(await as(U.mozo, `select public.ajustar_existencia($1, -50)`, [pienso]))) === 0);
await as(U.mozo, `select public.marcar_pedido($1, true)`, [pienso]);
check('marca que se ha pedido', one(await root(`select pedido_en is not null from public.existencias where id = $1`, [pienso])) === true);
await as(U.mozo, `select public.ajustar_existencia($1, 30)`, [pienso]);
check('al llegar el pedido, se da por recibido', one(await root(`select pedido_en is null from public.existencias where id = $1`, [pienso])) === true);
await falla('cambios absurdos', U.mozo, `select public.ajustar_existencia($1, 999999)`, [pienso], /no válida/);
check('un alumno no ve el almacén', (await as(U.alumno, `select * from public.existencias`)).rows.length === 0);
await falla('un alumno no toca el almacén', U.alumno, `select public.ajustar_existencia($1, 5)`, [pienso], /No puedes/);

console.log('Profesionales');
await as(U.admin, `insert into public.profesionales (hipica_id, nombre, oficio, telefono) values ($1, 'Dra. Ruiz', 'veterinario', '600')`, [h]);
check('el mozo ve el teléfono de la veterinaria', (await as(U.mozo, `select telefono from public.profesionales`)).rows[0]?.telefono === '600');
check('un alumno no', (await as(U.alumno, `select * from public.profesionales`)).rows.length === 0);
await falla('el mozo no añade profesionales', U.mozo, `insert into public.profesionales (hipica_id, nombre, oficio) values ($1, 'X', 'otro')`, [h], /row-level security/);

console.log('Altas desde la app');
const jinetes = JSON.stringify([{ nombre: 'Nora', yo: true, nivel: 'Galope 2' }, { nombre: 'Leo', yo: false, nivel: 'Iniciación', edad: 8 }]);
const potro = JSON.stringify({ nombre: 'Canelo', raza: 'PRE', nacimiento: 2017, pupilaje: 'semi', entrada: '2030-01-01' });
let r = one(await as(U.nueva, `select public.solicitar_alta($1, 'Nora Gil', '611', $2::jsonb, $3::jsonb, 'Hola')`, [tokA, jinetes, potro]));
check('sin revisión, el alta se aprueba sola', r === 'aprobada');
const fichas = (await as(U.nueva, `select nombre, nivel, titular_id is not null hijo from public.miembros order by nombre`)).rows;
check('se crean la titular (con su nivel) y su hijo', fichas.length === 2 && fichas.find(f => f.nombre === 'Nora Gil')?.nivel === 'Galope 2' && fichas.find(f => f.nombre === 'Leo')?.hijo, JSON.stringify(fichas));
check('y su caballo, con ella de propietaria', (await as(U.nueva, `select nombre, pupilaje from public.caballos`)).rows[0]?.pupilaje === 'semi');
check('repetirlo no duplica nada', one(await as(U.nueva, `select public.solicitar_alta($1, 'Nora Gil', '611', $2::jsonb)`, [tokA, jinetes])) === 'miembro');

await as(U.admin, `update public.hipicas set revisar_altas = true where id = $1`, [h]);
await falla('con revisión, el enlace ya no hace miembro directamente', U.otra, `select public.aceptar_invitacion($1, 'Otra')`, [tokA], /revisa las altas/);
r = one(await as(U.otra, `select public.solicitar_alta($1, 'Olga', null, '[{"nombre": "Olga", "yo": true}]'::jsonb)`, [tokA]));
check('con revisión, queda pendiente', r === 'pendiente');
check('pendiente, todavía no es miembro', (await as(U.otra, `select * from public.miembros`)).rows.length === 0);
check('ve su propia solicitud', (await as(U.otra, `select estado from public.altas`)).rows[0]?.estado === 'pendiente');
await falla('no manda otra mientras espera', U.otra, `select public.solicitar_alta($1, 'Olga', null, '[{"nombre": "Olga", "yo": true}]'::jsonb)`, [tokA], /pendiente/);
check('un alumno no ve las altas de otros', (await as(U.alumno, `select * from public.altas`)).rows.length === 0);
check('el admin las ve', (await as(U.admin, `select * from public.altas where estado = 'pendiente'`)).rows.length === 1);
const alta = one(await as(U.admin, `select id from public.altas where estado = 'pendiente'`));
await falla('un monitor no aprueba altas', U.monitor, `select public.revisar_alta($1, true)`, [alta], /No puedes revisar/);
await falla('otra hípica no aprueba mis altas', U.adminB, `select public.revisar_alta($1, true)`, [alta], /No puedes revisar/);
await falla('nadie se aprueba a sí mismo', U.otra, `select public._aprobar_alta($1)`, [alta], /permission denied/);
await as(U.admin, `select public.revisar_alta($1, true)`, [alta]);
check('el admin la aprueba y ya es miembro', (await as(U.otra, `select * from public.miembros`)).rows.length === 1);
r = one(await as(U.tercera, `select public.solicitar_alta($1, 'Tere', null, '[{"nombre": "Tere", "yo": true}]'::jsonb)`, [tokA]));
const alta2 = one(await as(U.admin, `select id from public.altas where estado = 'pendiente'`));
await as(U.admin, `select public.revisar_alta($1, false)`, [alta2]);
check('rechazada, no entra', (await as(U.tercera, `select * from public.miembros`)).rows.length === 0 && (await as(U.tercera, `select estado from public.altas`)).rows[0]?.estado === 'rechazada');

await falla('con el enlace de monitor no se pide alta', U.tercera, `select public.solicitar_alta($1, 'X', null, '[{"nombre": "X", "yo": true}]'::jsonb)`, [tokM], /no válida/);
await falla('token inventado', U.tercera, `select public.solicitar_alta('xxx', 'X', null, '[{"nombre": "X", "yo": true}]'::jsonb)`, [], /no válida/);
await falla('anónimo no pide altas', null, `select public.solicitar_alta($1, 'X', null, '[]'::jsonb)`, [tokA], /permission denied/);
await falla('jinete con nombre gigante', U.tercera, `select public.solicitar_alta($1, 'X', null, $2::jsonb)`, [tokA, JSON.stringify([{ nombre: 'a'.repeat(500), yo: true }])], /Revisa los jinetes/);
await falla('20 hijos de golpe', U.tercera, `select public.solicitar_alta($1, 'X', null, $2::jsonb)`, [tokA, JSON.stringify(Array.from({ length: 20 }, (_, i) => ({ nombre: 'H' + i })))], /Revisa los jinetes/);
await falla('dos jinetes que dicen ser "yo"', U.tercera, `select public.solicitar_alta($1, 'X', null, $2::jsonb)`, [tokA, JSON.stringify([{ nombre: 'A', yo: true }, { nombre: 'B', yo: true }])], /Revisa los jinetes/);
await falla('pupilaje inventado', U.tercera, `select public.solicitar_alta($1, 'X', null, '[]'::jsonb, '{"nombre": "Rayo", "pupilaje": "gratis"}'::jsonb)`, [tokA], /caballo/);
await falla('sin jinetes ni caballo', U.tercera, `select public.solicitar_alta($1, 'X', null, '[]'::jsonb)`, [tokA], /quién va a montar/);
await as(U.tercera, `select public.solicitar_alta($1, 'Tere', null, $2::jsonb)`, [tokA, JSON.stringify([{ nombre: 'Tere', yo: true, admin: true, rol: 'admin' }])]);
const guardado = (await as(U.admin, `select jinetes from public.altas where estado = 'pendiente'`)).rows[0]?.jinetes;
check('los campos extra que mande alguien no se guardan', guardado && !JSON.stringify(guardado).includes('admin'), JSON.stringify(guardado));
await as(U.admin, `select public.dar_de_baja($1)`, [one(await root(`select id from public.miembros where user_id = $1`, [U.otra]))]);
await falla('dado de baja, no vuelve a entrar pidiendo el alta', U.otra, `select public.solicitar_alta($1, 'Olga', null, '[{"nombre": "Olga", "yo": true}]'::jsonb)`, [tokA], /no válida/);

console.log(`\n${ok} correctas, ${fail} fallidas`);
process.exit(fail ? 1 : 0);
