import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const migrations = process.argv.slice(2).map(f => readFileSync(f, 'utf8'));
const db = new PGlite();

// --- Simular el entorno de Supabase -----------------------------------
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated;
`);
for (const m of migrations) await db.exec(m);

const U = {
  adminA: '00000000-0000-0000-0000-00000000000a',
  adminB: '00000000-0000-0000-0000-00000000000b',
  alumno1: '00000000-0000-0000-0000-000000000001',
  alumno2: '00000000-0000-0000-0000-000000000002',
  monitor: '00000000-0000-0000-0000-00000000000c',
  intruso: '00000000-0000-0000-0000-00000000000d',
  otro: '00000000-0000-0000-0000-00000000000e',
};
for (const id of Object.values(U)) await db.query('insert into auth.users values ($1)', [id]);

let ok = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { ok++; console.log('  OK   ' + name); }
  else { fail++; console.log('  FAIL ' + name + ' ' + extra); }
};

async function as(uid, sql, params = []) {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
  await db.exec(uid ? 'set role authenticated' : 'set role anon');
  try { return await db.query(sql, params); }
  finally { await db.exec('reset role'); }
}
async function expectError(name, uid, sql, params, pattern) {
  try { await as(uid, sql, params); check(name, false, '(no dio error)'); }
  catch (e) { check(name, pattern.test(e.message), `(error: ${e.message})`); }
}
const one = r => Object.values(r.rows[0])[0];

console.log('Alta de hípicas e invitaciones');
const h1 = one(await as(U.adminA, `select public.crear_hipica('Hípica Uno', 'Ana')`));
const h2 = one(await as(U.adminB, `select public.crear_hipica('Hípica Dos', 'Blas')`));
check('cada admin crea su hípica', h1 && h2 && h1 !== h2);

const invAlumno = one(await as(U.adminA,
  `insert into public.invitaciones (hipica_id, rol) values ($1, 'alumno') returning token`, [h1]));
const invMonitor = one(await as(U.adminA,
  `insert into public.invitaciones (hipica_id, rol, usos_max) values ($1, 'monitor', 1) returning token`, [h1]));
await expectError('no se puede invitar como admin', U.adminA,
  `insert into public.invitaciones (hipica_id, rol) values ($1, 'admin')`, [h1], /check/i);
await expectError('admin B no crea invitaciones en la hípica A', U.adminB,
  `insert into public.invitaciones (hipica_id) values ($1)`, [h1], /row-level security/i);

await as(U.alumno1, `select public.aceptar_invitacion($1, 'Alumno Uno')`, [invAlumno]);
await as(U.alumno2, `select public.aceptar_invitacion($1, 'Alumno Dos')`, [invAlumno]);
await as(U.monitor, `select public.aceptar_invitacion($1, 'Mónica')`, [invMonitor]);
await expectError('invitación de un solo uso no se reutiliza', U.otro,
  `select public.aceptar_invitacion($1, 'Otro')`, [invMonitor], /no válida/);
await expectError('token falso rechazado', U.otro,
  `select public.aceptar_invitacion('falso', 'Otro')`, [], /no válida/);
const repetida = one(await as(U.alumno1, `select public.aceptar_invitacion($1, 'Alumno Uno')`, [invAlumno]));
check('aceptar dos veces no duplica al miembro', repetida === h1);

console.log('Clases y sesiones');
const monitorId = one(await as(U.adminA,
  `select id from public.miembros where hipica_id = $1 and rol = 'monitor'`, [h1]));
const claseId = one(await as(U.adminA, `
  insert into public.clases (hipica_id, titulo, monitor_id, dia_semana, hora_inicio, plazas)
  values ($1, 'Iniciación', $2, extract(isodow from current_date + 1), '18:00', 1) returning id`,
  [h1, monitorId]));
const creadas = one(await as(U.adminA, `select public.generar_sesiones($1, current_date + 14)`, [h1]));
check('genera 2 sesiones en 14 días', creadas === 2, `(creadas: ${creadas})`);
const otraVez = one(await as(U.adminA, `select public.generar_sesiones($1, current_date + 14)`, [h1]));
check('volver a generar no duplica', otraVez === 0, `(creadas: ${otraVez})`);
await expectError('un alumno no genera sesiones', U.alumno1,
  `select public.generar_sesiones($1, current_date + 7)`, [h1], /administrador/);

const monitorH2 = one(await as(U.adminB,
  `select id from public.miembros where hipica_id = $1`, [h2]));
await expectError('no se asigna a una clase un monitor de otra hípica', U.adminA, `
  insert into public.clases (hipica_id, titulo, monitor_id, dia_semana, hora_inicio, plazas)
  values ($1, 'Mal', $2, 1, '10:00', 4)`, [h1, monitorH2], /foreign key/i);

console.log('Aislamiento entre hípicas');
for (const t of ['hipicas', 'miembros', 'clases', 'sesiones', 'reservas', 'invitaciones']) {
  const r = await as(U.adminB, `select count(*)::int as n from public.${t} where hipica_id = $1`.replace(
    t === 'hipicas' ? 'hipica_id' : '§', 'id'), [h1]);
  check(`admin B no ve ${t} de la hípica A`, r.rows[0].n === 0, `(ve ${r.rows[0].n})`);
}
await expectError('admin B no crea clases en la hípica A', U.adminB, `
  insert into public.clases (hipica_id, titulo, dia_semana, hora_inicio, plazas)
  values ($1, 'Intrusa', 1, '10:00', 4)`, [h1], /row-level security/i);
const upd = await as(U.adminB, `update public.hipicas set nombre = 'Hackeada' where id = $1`, [h1]);
check('admin B no puede renombrar la hípica A', upd.affectedRows === 0);
const nInt = (await as(U.intruso, `select count(*)::int as n from public.hipicas`)).rows[0].n;
check('un usuario sin hípica no ve ninguna', nInt === 0);
await expectError('usuario anónimo no puede leer nada', null,
  `select * from public.hipicas`, [], /permission denied/i);

console.log('Reservas');
const [s1, s2] = (await as(U.adminA,
  `select id from public.sesiones where hipica_id = $1 order by inicio`, [h1])).rows.map(r => r.id);
await expectError('admin B no puede reservar en la hípica A', U.adminB,
  `select public.reservar($1)`, [s1], /No perteneces/);
const r1 = one(await as(U.alumno1, `select public.reservar($1)`, [s1]));
check('alumno 1 reserva la única plaza', !!r1);
await expectError('alumno 1 no reserva dos veces', U.alumno1,
  `select public.reservar($1)`, [s1], /Ya tienes plaza/);
await expectError('alumno 2 no puede: no quedan plazas', U.alumno2,
  `select public.reservar($1)`, [s1], /No quedan plazas/);
await expectError('no se puede insertar una reserva directamente', U.alumno2,
  `insert into public.reservas (hipica_id, sesion_id, miembro_id)
   select hipica_id, $1, id from public.miembros where user_id = auth.uid()`, [s1], /row-level security|permission denied/i);

const verA1 = (await as(U.alumno1, `select count(*)::int as n from public.reservas`)).rows[0].n;
const verA2 = (await as(U.alumno2, `select count(*)::int as n from public.reservas`)).rows[0].n;
const verMon = (await as(U.monitor, `select count(*)::int as n from public.reservas`)).rows[0].n;
check('alumno 1 ve su reserva', verA1 === 1);
check('alumno 2 no ve reservas ajenas', verA2 === 0);
check('el monitor ve las reservas de su hípica', verMon === 1);

const nombres = (await as(U.alumno1, `select nombre from public.miembros order by nombre`)).rows.map(r => r.nombre);
check('un alumno ve admin, monitor y a sí mismo, no a otros alumnos',
  JSON.stringify(nombres) === JSON.stringify(['Alumno Uno', 'Ana', 'Mónica']), JSON.stringify(nombres));

await expectError('un alumno no puede hacerse admin', U.alumno1,
  `update public.miembros set rol = 'admin' where user_id = auth.uid()`, [], /administrador/);
const tel = await as(U.alumno1, `update public.miembros set telefono = '600000000' where user_id = auth.uid()`);
check('un alumno sí puede cambiar su teléfono', tel.affectedRows === 1);

console.log('Anulaciones y asistencia');
await as(U.alumno1, `select public.anular_reserva($1)`, [r1]);
const r2 = one(await as(U.alumno2, `select public.reservar($1)`, [s1]));
check('tras anular, alumno 2 consigue la plaza', !!r2);
await expectError('alumno 1 no anula la reserva de alumno 2', U.alumno1,
  `select public.anular_reserva($1)`, [r2], /No puedes anular/);

const r1b = one(await as(U.alumno1, `select public.reservar($1)`, [s1]).catch(() => ({ rows: [{ x: null }] })));
check('la plaza sigue llena tras la reasignación', r1b === null);

await as(U.monitor, `select public.marcar_asistencia($1, true)`, [r2]);
const asis = one(await as(U.adminA, `select asistio from public.reservas where id = $1`, [r2]));
check('el monitor marca asistencia', asis === true);
await expectError('un alumno no marca asistencia', U.alumno2,
  `select public.marcar_asistencia($1, true)`, [r2], /No puedes marcar/);

const pronto = one(await as(U.adminA, `
  insert into public.sesiones (hipica_id, titulo, inicio, fin, plazas)
  values ($1, 'Clase en 2 horas', now() + interval '2 hours', now() + interval '3 hours', 4) returning id`, [h1]));
const rp = one(await as(U.alumno1, `select public.reservar($1)`, [pronto]));
await expectError('el alumno no anula fuera de plazo (12 h)', U.alumno1,
  `select public.anular_reserva($1)`, [rp], /plazo/);
await as(U.adminA, `select public.anular_reserva($1)`, [rp]);
const est = one(await as(U.adminA, `select estado::text from public.reservas where id = $1`, [rp]));
check('el admin sí anula fuera de plazo', est === 'anulada');

const pasada = one(await as(U.adminA, `
  insert into public.sesiones (hipica_id, titulo, inicio, fin, plazas)
  values ($1, 'Clase pasada', now() - interval '2 hours', now() - interval '1 hour', 4) returning id`, [h1]));
await expectError('no se reserva una clase ya empezada', U.alumno1,
  `select public.reservar($1)`, [pasada], /ya ha empezado/);
await as(U.adminA, `update public.sesiones set cancelada = true where id = $1`, [s2]);
await expectError('no se reserva una clase cancelada', U.alumno1,
  `select public.reservar($1)`, [s2], /cancelada/);


if (migrations.length > 1) {
  console.log('Horario e invitaciones (0002)');
  const desde = new Date().toISOString(), hasta = new Date(Date.now() + 30 * 864e5).toISOString();
  const hA1 = (await as(U.alumno1, `select * from public.horario($1, $2, $3)`, [h1, desde, hasta])).rows;
  check('el alumno ve el horario de su hípica', hA1.length >= 2, `(${hA1.length})`);
  const fila = hA1.find(r => r.id === s1);
  check('ve plazas ocupadas aunque no vea reservas ajenas', fila && fila.ocupadas === 1, JSON.stringify(fila));
  check('su reserva no aparece en una sesión ajena', fila && fila.mi_reserva === null);
  const hA2 = (await as(U.alumno2, `select * from public.horario($1, $2, $3)`, [h1, desde, hasta])).rows;
  const fila2 = hA2.find(r => r.id === s1);
  check('alumno 2 ve su propia reserva', fila2 && fila2.mi_reserva === r2);
  const hB = (await as(U.adminB, `select * from public.horario($1, $2, $3)`, [h1, desde, hasta])).rows;
  check('admin B no ve el horario de la hípica A', hB.length === 0);
  const largo = (await as(U.alumno1, `select * from public.horario($1, $2, $3)`,
    [h1, desde, new Date(Date.now() + 90 * 864e5).toISOString()])).rows;
  check('rango de más de 62 días no devuelve nada', largo.length === 0);
  await expectError('anónimo no puede consultar el horario', null,
    `select * from public.horario($1, $2, $3)`, [h1, desde, hasta], /permission denied/i);

  const inv = (await as(U.intruso, `select * from public.ver_invitacion($1)`, [invAlumno])).rows;
  check('ver_invitacion muestra hípica y rol', inv.length === 1 && inv[0].hipica_nombre === 'Hípica Uno' && inv[0].rol === 'alumno');
  const gastada = (await as(U.intruso, `select * from public.ver_invitacion($1)`, [invMonitor])).rows;
  check('ver_invitacion no muestra invitaciones gastadas', gastada.length === 0);
  const falsa = (await as(U.intruso, `select * from public.ver_invitacion('nope')`)).rows;
  check('ver_invitacion no muestra tokens falsos', falsa.length === 0);
}

console.log(`\n${ok} correctas, ${fail} fallidas`);
process.exit(fail ? 1 : 0);
