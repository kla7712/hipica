// Pruebas de ataque contra la base de datos.
// Cada prueba intenta algo que un usuario malintencionado haría y comprueba
// que la base de datos lo impide.
//   npm i -D @electric-sql/pglite
//   node supabase/tests/ataques.test.mjs supabase/migrations/*.sql
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const db = new PGlite();
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated;
`);
for (const f of process.argv.slice(2).sort()) await db.exec(readFileSync(f, 'utf8'));

const U = Object.fromEntries(
  ['admin', 'admin2', 'monitor', 'alumno', 'alumno2', 'intruso', 'adminB'].map((k, i) =>
    [k, `00000000-0000-0000-0000-0000000000${String(i + 10)}`]));
for (const id of Object.values(U)) await db.query('insert into auth.users values ($1)', [id]);

let ok = 0, fail = 0;
const res = (name, safe, detalle = '') => {
  if (safe) { ok++; console.log('  BLOQUEADO  ' + name); }
  else { fail++; console.log('  VULNERABLE ' + name + (detalle ? '  ' + detalle : '')); }
};
async function as(uid, sql, params = []) {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
  await db.exec(uid ? 'set role authenticated' : 'set role anon');
  try { return await db.query(sql, params); } finally { await db.exec('reset role'); }
}
// El ataque es seguro si da error o si no cambia/devuelve nada.
// Cada ataque va en una transacción que se deshace, para que no afecte a los siguientes.
async function ataque(name, uid, sql, params = [], seguroSi = r => r.rows.length === 0 && !(r.affectedRows > 0)) {
  await db.exec('begin');
  try { const r = await as(uid, sql, params); res(name, seguroSi(r), JSON.stringify(r.rows).slice(0, 120)); }
  catch (e) { res(name, true); if (process.env.DEBUG) console.log('      ' + e.message.slice(0, 140)); }
  finally { await db.exec('rollback'); }
}
const one = r => Object.values(r.rows[0])[0];

// ---- Escenario: hípica A con admin, monitor y dos alumnos; hípica B aparte ----
const hA = one(await as(U.admin, `select public.crear_hipica('Hípica A', 'Ana Admin')`));
const hB = one(await as(U.adminB, `select public.crear_hipica('Hípica B', 'Bea')`));
const tokAlumno = one(await as(U.admin, `insert into public.invitaciones (hipica_id) values ($1) returning token`, [hA]));
const tokMon = one(await as(U.admin, `insert into public.invitaciones (hipica_id, rol, usos_max) values ($1, 'monitor', 1) returning token`, [hA]));
await as(U.monitor, `select public.aceptar_invitacion($1, 'Mario Monitor')`, [tokMon]);
await as(U.alumno, `select public.aceptar_invitacion($1, 'Alba Alumna')`, [tokAlumno]);
await as(U.alumno2, `select public.aceptar_invitacion($1, 'Luis Alumno')`, [tokAlumno]);
await db.exec(`select set_config('request.jwt.claim.sub', '', false); update public.miembros set telefono = '600111222'`); // todos con teléfono
const idAdmin = one(await db.query(`select id from public.miembros where user_id = $1`, [U.admin]));
const idAlumno = one(await db.query(`select id from public.miembros where user_id = $1`, [U.alumno]));
const idAlumno2 = one(await db.query(`select id from public.miembros where user_id = $1`, [U.alumno2]));
const clase = one(await as(U.admin, `insert into public.clases (hipica_id, titulo, dia_semana, hora_inicio, plazas)
  values ($1, 'Iniciación', 1, '18:00', 4) returning id`, [hA]));
const sesion = one(await as(U.admin, `insert into public.sesiones (hipica_id, clase_id, titulo, inicio, fin, plazas)
  values ($1, $2, 'Iniciación', now() + interval '3 days', now() + interval '3 days 1 hour', 4) returning id`, [hA, clase]));
const reservaAlumno2 = one(await as(U.alumno2, `select public.reservar($1)`, [sesion]));

console.log('\n1. Escalada de privilegios');
await ataque('alumno se pone rol admin', U.alumno, `update public.miembros set rol = 'admin' where user_id = auth.uid()`);
await ataque('alumno se pasa a otra hípica', U.alumno, `update public.miembros set hipica_id = $1 where user_id = auth.uid()`, [hB]);
await ataque('alumno cambia el id de su ficha', U.alumno, `update public.miembros set id = gen_random_uuid() where user_id = auth.uid()`);
await ataque('alumno se inserta como admin', U.alumno, `insert into public.miembros (hipica_id, user_id, rol, nombre) values ($1, auth.uid(), 'admin', 'x')`, [hB]);
await ataque('monitor crea una invitación de admin', U.monitor, `insert into public.invitaciones (hipica_id, rol) values ($1, 'admin')`, [hA]);
await ataque('monitor crea invitaciones', U.monitor, `insert into public.invitaciones (hipica_id) values ($1)`, [hA]);
await ataque('monitor crea clases', U.monitor, `insert into public.clases (hipica_id, titulo, dia_semana, hora_inicio, plazas) values ($1, 'x', 1, '10:00', 4)`, [hA]);
await ataque('monitor borra a un alumno', U.monitor, `delete from public.miembros where id = $1`, [idAlumno]);
await ataque('alumno cancela una clase', U.alumno, `update public.sesiones set cancelada = true where id = $1`, [sesion]);
await ataque('admin cambia el id de su hípica', U.admin, `update public.hipicas set id = gen_random_uuid() where id = $1`, [hA]);
await ataque('admin se quita a sí mismo el rol (hípica sin admin)', U.admin, `update public.miembros set rol = 'alumno' where id = $1`, [idAdmin]);

console.log('\n2. Datos personales');
await ataque('alumno lee el teléfono de otros alumnos', U.alumno, `select telefono from public.miembros where id = $1`, [idAlumno2]);
await ataque('alumno lee el teléfono del admin y monitores', U.alumno, `select nombre, telefono from public.miembros where rol <> 'alumno'`);
await ataque('alumno ve quién ha reservado', U.alumno, `select * from public.reservas where sesion_id = $1`, [sesion]);
await ataque('alumno lee los enlaces de invitación', U.alumno, `select token from public.invitaciones`);
await ataque('usuario sin hípica ve alguna hípica', U.intruso, `select * from public.hipicas`);
await ataque('usuario sin hípica ve miembros', U.intruso, `select * from public.miembros`);
await ataque('admin de otra hípica ve sus alumnos', U.adminB, `select * from public.miembros where hipica_id = $1`, [hA]);
await ataque('admin de otra hípica ve su horario', U.adminB, `select * from public.horario($1, now(), now() + interval '7 days')`, [hA]);
await ataque('anónimo lee hípicas', null, `select * from public.hipicas`);
await ataque('anónimo usa ver_invitacion', null, `select * from public.ver_invitacion($1)`, [tokAlumno]);

console.log('\n3. Reservas y asistencia');
await ataque('alumno anula la reserva de otro', U.alumno, `select public.anular_reserva($1)`, [reservaAlumno2]);
await ataque('alumno inserta una reserva a nombre de otro', U.alumno, `insert into public.reservas (hipica_id, sesion_id, miembro_id) values ($1, $2, $3)`, [hA, sesion, idAlumno2]);
await ataque('alumno se marca la asistencia', U.alumno2, `select public.marcar_asistencia($1, true)`, [reservaAlumno2]);
await ataque('alumno cambia el estado de su reserva a mano', U.alumno2, `update public.reservas set estado = 'anulada' where id = $1`, [reservaAlumno2]);
await ataque('intruso reserva en una hípica ajena', U.intruso, `select public.reservar($1)`, [sesion]);

console.log('\n4. Abuso de funciones');
await ataque('alumno genera el calendario', U.alumno, `select public.generar_sesiones($1, current_date + 7)`, [hA]);
await ataque('admin genera calendario de más de 120 días', U.admin, `select public.generar_sesiones($1, current_date + 400)`, [hA]);
await ataque('horario con rango enorme (carga)', U.alumno, `select * from public.horario($1, now(), now() + interval '10 years')`, [hA]);
await ataque('token de invitación inventado', U.intruso, `select public.aceptar_invitacion('00000000000000000000000000000000', 'x')`);
{
  let creadas = 0;
  for (let i = 0; i < 20; i++) {
    try { await as(U.intruso, `select public.crear_hipica($1, 'Spam')`, [`Spam ${i}`]); creadas++; } catch { break; }
  }
  res('un usuario crea hípicas sin límite (spam)', creadas <= 5, `(creó ${creadas})`);
}
await ataque('admin pone una zona horaria inválida', U.admin, `update public.hipicas set zona_horaria = 'Marte/Olympus' where id = $1`, [hA]);
await ataque('alumno guarda un teléfono de 10.000 caracteres', U.alumno, `update public.miembros set telefono = repeat('9', 10000) where user_id = auth.uid()`);

console.log('\n5. Miembros dados de baja');
await db.exec(`select set_config('request.jwt.claim.sub', '', false); update public.miembros set activo = false where id = '${idAlumno2}'`);
await ataque('alumno dado de baja reserva', U.alumno2, `select public.reservar($1)`, [sesion]);
await ataque('alumno dado de baja ve el horario', U.alumno2, `select * from public.horario($1, now(), now() + interval '7 days')`, [hA]);
await ataque('alumno dado de baja ve la hípica', U.alumno2, `select * from public.hipicas where id = $1`, [hA]);
await ataque('alumno dado de baja se reactiva solo', U.alumno2, `update public.miembros set activo = true where user_id = auth.uid()`);
await ataque('alumno dado de baja vuelve a entrar con el enlace', U.alumno2,
  `select public.aceptar_invitacion($1, 'Luis') as h, (select activo from public.miembros where user_id = auth.uid()) as activo`, [tokAlumno],
  r => !r.rows[0]?.activo);
await db.exec(`select set_config('request.jwt.claim.sub', '', false); update public.miembros set activo = true where id = '${idAlumno2}'`);

console.log('\n6. Familias y cuentas (0004)');
const tiene0004 = (await db.query(`select to_regprocedure('public.anadir_jinete(uuid,text)') is not null as si`)).rows[0].si;
if (tiene0004) {
  await ataque('alumno añade un jinete en una hípica ajena', U.alumno, `select public.anadir_jinete($1, 'x')`, [hB]);
  await ataque('alumno se asigna como titular de otro alumno', U.alumno, `update public.miembros set titular_id = $1 where id = $2`, [idAlumno, idAlumno2]);
  await ataque('alumno crea un "hijo" con rol admin', U.alumno, `insert into public.miembros (hipica_id, rol, nombre, titular_id) values ($1, 'admin', 'x', $2)`, [hA, idAlumno]);
  await ataque('alumno reserva en nombre de otro alumno', U.alumno, `select public.reservar($1, $2)`, [sesion, idAlumno2]);
  await ataque('alumno lanza el calendario automático', U.alumno, `select public.generar_calendario_automatico()`);
  await ataque('alumno usa la baja interna', U.alumno, `select public._baja($1)`, [idAlumno2]);
  await ataque('anónimo borra cuentas', null, `select public.borrar_mi_cuenta()`);
  await ataque('alumno da de alta alumnos sin cuenta', U.alumno, `select public.anadir_alumno_sin_cuenta($1, 'x', '')`, [hA]);
}

console.log('\n7. Inyección SQL');
{
  const nombre = `x'); drop table public.reservas; --`;
  await as(U.intruso, `select public.aceptar_invitacion($1, $2)`, [tokAlumno, nombre]).catch(() => {});
  const sigue = (await db.query(`select to_regclass('public.reservas') is not null as existe`)).rows[0].existe;
  res('nombre con SQL malicioso', sigue);
}

console.log(`\n${ok} bloqueados, ${fail} vulnerables`);
process.exit(fail ? 1 : 0);
