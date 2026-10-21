// Pruebas de 0006 (escuela): pistas, niveles, caballos, bonos, lista de
// espera y tablón. Permisos y ataques.
//   node supabase/tests/escuela.test.mjs supabase/migrations/*.sql
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
  madre: '00000000-0000-0000-0000-000000000001',
  alumno: '00000000-0000-0000-0000-000000000002',
  alumno3: '00000000-0000-0000-0000-000000000003',
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

// ---------- Preparación ----------
const h = one(await as(U.admin, `select public.crear_hipica('Escuela', 'Ana')`));
const hB = one(await as(U.adminB, `select public.crear_hipica('Otra', 'Bea')`));
const tokA = one(await as(U.admin, `insert into public.invitaciones (hipica_id) values ($1) returning token`, [h]));
const tokM = one(await as(U.admin, `insert into public.invitaciones (hipica_id, rol, usos_max) values ($1, 'monitor', 1) returning token`, [h]));
await as(U.monitor, `select public.aceptar_invitacion($1, 'Mónica')`, [tokM]);
await as(U.madre, `select public.aceptar_invitacion($1, 'Marta')`, [tokA]);
await as(U.alumno, `select public.aceptar_invitacion($1, 'Álex')`, [tokA]);
await as(U.alumno3, `select public.aceptar_invitacion($1, 'Teo')`, [tokA]);
const id = async (uid) => one(await root(`select id from public.miembros where user_id = $1 and hipica_id = $2`, [uid, h]));
const [mMadre, mAlumno, mAlumno3] = [await id(U.madre), await id(U.alumno), await id(U.alumno3)];
const hija = one(await as(U.madre, `select public.anadir_jinete($1, 'Lucía')`, [h]));

console.log('Pistas');
const pista = one(await as(U.admin, `insert into public.pistas (hipica_id, nombre) values ($1, 'Pista 1') returning id`, [h]));
check('el admin crea una pista', !!pista);
await falla('un alumno no crea pistas', U.alumno, `insert into public.pistas (hipica_id, nombre) values ($1, 'X')`, [h], /row-level security/);
await falla('un monitor no crea pistas', U.monitor, `insert into public.pistas (hipica_id, nombre) values ($1, 'X')`, [h], /row-level security/);
await falla('otro admin no crea pistas aquí', U.adminB, `insert into public.pistas (hipica_id, nombre) values ($1, 'X')`, [h], /row-level security/);
check('los alumnos ven las pistas', (await as(U.alumno, `select * from public.pistas`)).rows.length === 1);
check('otra hípica no ve mis pistas', (await as(U.adminB, `select * from public.pistas where hipica_id = $1`, [h])).rows.length === 0);
const pistaB = one(await as(U.adminB, `insert into public.pistas (hipica_id, nombre) values ($1, 'Suya') returning id`, [hB]));
await falla('no se puede usar la pista de otra hípica en una clase', U.admin,
  `insert into public.clases (hipica_id, titulo, dia_semana, hora_inicio, plazas, pista_id) values ($1, 'X', 1, '10:00', 4, $2)`, [h, pistaB], /foreign key/);

console.log('Calendario con pista y tipo');
const dia = one(await root(`select extract(isodow from current_date + 2)::int`));
await as(U.admin, `insert into public.clases (hipica_id, titulo, dia_semana, hora_inicio, plazas, pista_id, tipo) values ($1, 'Libre', $2, '10:00', 2, $3, 'libre')`, [h, dia, pista]);
await as(U.admin, `select public.generar_sesiones($1, current_date + 3)`, [h]);
const sLibre = (await root(`select id, pista_id, tipo from public.sesiones where titulo = 'Libre'`)).rows[0];
check('la sesión copia pista y tipo de la clase', sLibre?.pista_id === pista && sLibre?.tipo === 'libre');

// Sesiones de prueba (directas, en el futuro)
const nueva = async (titulo, plazas, tipo = 'grupo', dias = 2) => one(await root(
  `insert into public.sesiones (hipica_id, titulo, inicio, fin, plazas, tipo, pista_id)
   values ($1, $2, now() + make_interval(days => $3), now() + make_interval(days => $3, hours => 1), $4, $5, $6) returning id`,
  [h, titulo, dias, plazas, tipo, pista]));

console.log('Niveles');
await as(U.monitor, `update public.miembros set nivel = 'Galope 2' where id = $1`, [mAlumno]);
check('el monitor pone el nivel a un alumno', one(await root(`select nivel from public.miembros where id = $1`, [mAlumno])) === 'Galope 2');
await falla('el alumno no se sube de nivel', U.alumno, `update public.miembros set nivel = 'Galope 7' where id = $1`, [mAlumno], /Solo la hípica/);
await falla('la madre no cambia el nivel de su hija', U.madre, `update public.miembros set nivel = 'Galope 7' where id = $1`, [hija], /Solo la hípica/);
await falla('el monitor no cambia el teléfono de un alumno', U.monitor, `update public.miembros set telefono = '666' where id = $1`, [mAlumno], /Solo el administrador/);
await falla('el monitor no cambia el nombre de un alumno', U.monitor, `update public.miembros set nombre = 'X' where id = $1`, [mAlumno], /Solo el administrador/);
await falla('el monitor no se hace admin', U.monitor, `update public.miembros set rol = 'admin' where user_id = auth.uid()`, [], /Solo un administrador/);
await falla('el monitor no da de baja a nadie', U.monitor, `update public.miembros set activo = false where id = $1`, [mAlumno], /Solo un administrador/);
await as(U.alumno, `update public.miembros set telefono = '611' where id = $1`, [mAlumno]);
check('el alumno sigue pudiendo cambiar su teléfono', one(await root(`select telefono from public.miembros where id = $1`, [mAlumno])) === '611');
await as(U.madre, `update public.miembros set nombre = 'Lucía L.' where id = $1`, [hija]);
check('la madre sigue pudiendo cambiar el nombre de su hija', one(await root(`select nombre from public.miembros where id = $1`, [hija])) === 'Lucía L.');
await falla('otro admin no cambia niveles aquí', U.adminB, `update public.miembros set nivel = 'X' where id = $1`, [mAlumno], /./);

console.log('Caballos');
const nube = one(await as(U.admin, `insert into public.caballos (hipica_id, nombre) values ($1, 'Nube') returning id`, [h]));
const sol = one(await as(U.admin, `insert into public.caballos (hipica_id, nombre) values ($1, 'Sol') returning id`, [h]));
const suyo = one(await as(U.adminB, `insert into public.caballos (hipica_id, nombre) values ($1, 'Ajeno') returning id`, [hB]));
check('el admin da de alta caballos', !!nube && !!sol);
await falla('un monitor no da de alta caballos', U.monitor, `insert into public.caballos (hipica_id, nombre) values ($1, 'X')`, [h], /row-level security/);
check('el monitor ve los caballos', (await as(U.monitor, `select * from public.caballos`)).rows.length === 2);
check('un alumno no ve la lista de caballos', (await as(U.alumno, `select * from public.caballos`)).rows.length === 0);

console.log('Bonos');
const s1 = await nueva('Grupo 1', 3);
const bonoAlumno = one(await as(U.admin, `insert into public.bonos (hipica_id, miembro_id, clases) values ($1, $2, 2) returning id`, [h, mAlumno]));
await falla('un alumno no se regala un bono', U.alumno, `insert into public.bonos (hipica_id, miembro_id, clases) values ($1, $2, 50)`, [h, mAlumno], /row-level security/);
await falla('un monitor no crea bonos', U.monitor, `insert into public.bonos (hipica_id, miembro_id, clases) values ($1, $2, 5)`, [h, mAlumno], /row-level security/);
await falla('un alumno no amplía su bono', U.alumno, `update public.bonos set clases = 99 where id = $1`, [bonoAlumno], /./);
await falla('no se crea un bono para un alumno de otra hípica', U.adminB, `insert into public.bonos (hipica_id, miembro_id, clases) values ($1, $2, 5)`, [hB, mAlumno], /foreign key/);
const rA1 = one(await as(U.alumno, `select public.reservar($1)`, [s1]));
check('la reserva de grupo gasta una clase del bono', one(await root(`select bono_id from public.reservas where id = $1`, [rA1])) === bonoAlumno);
let eb = (await as(U.alumno, `select * from public.estado_bonos($1)`, [h])).rows;
check('el alumno ve su bono: 1 de 2 usada', eb.length === 1 && eb[0].clases === 2 && eb[0].usadas === 1, JSON.stringify(eb));
check('el alumno no ve los bonos de otros', (await as(U.alumno, `select * from public.bonos`)).rows.length === 1);
const eM = (await as(U.madre, `select nombre from public.estado_bonos($1)`, [h])).rows.map(r => r.nombre).sort();
check('la madre ve su estado y el de su hija, nada más', JSON.stringify(eM) === JSON.stringify(['Lucía L.', 'Marta']), JSON.stringify(eM));
check('el monitor ve el estado de todos los alumnos', (await as(U.monitor, `select * from public.estado_bonos($1)`, [h])).rows.length === 4);
check('otra hípica no ve los bonos', (await as(U.adminB, `select * from public.estado_bonos($1)`, [h])).rows.length === 0);
await as(U.alumno, `select public.anular_reserva($1)`, [rA1]);
eb = (await as(U.alumno, `select * from public.estado_bonos($1)`, [h])).rows;
check('al anular, la clase vuelve al bono', eb[0].usadas === 0);
const sLib = await nueva('Libre 2', 3, 'libre');
const rLib = one(await as(U.alumno, `select public.reservar($1)`, [sLib]));
check('la pista libre no gasta bono', one(await root(`select bono_id from public.reservas where id = $1`, [rLib])) === null);

// Exigir bono
await as(U.admin, `update public.hipicas set exigir_bono = true where id = $1`, [h]);
const s2 = await nueva('Grupo 2', 5);
await falla('con "exigir bono", sin bono no se reserva', U.alumno3, `select public.reservar($1)`, [s2], /No te quedan clases/);
const rAdm = one(await as(U.admin, `select public.reservar($1, $2)`, [s2, mAlumno3]));
check('el admin sí puede apuntar a alguien sin bono', !!rAdm);
const s3 = await nueva('Grupo 3', 5), s4 = await nueva('Grupo 4', 5), s5 = await nueva('Grupo 5', 5);
await as(U.alumno, `select public.reservar($1)`, [s3]);
await as(U.alumno, `select public.reservar($1)`, [s4]);
await falla('se acaba el bono y ya no deja reservar', U.alumno, `select public.reservar($1)`, [s5], /No te quedan clases/);
await root(`update public.sesiones set cancelada = true where id = $1`, [s4]);
eb = (await as(U.alumno, `select * from public.estado_bonos($1)`, [h])).rows;
check('una clase cancelada por la hípica no gasta bono', eb[0].usadas === 1, JSON.stringify(eb));
await root(`update public.sesiones set cancelada = false where id = $1`, [s4]);
const caducado = one(await as(U.admin, `insert into public.bonos (hipica_id, miembro_id, clases, caduca) values ($1, $2, 5, current_date - 1) returning id`, [h, mAlumno3]));
await falla('un bono caducado no sirve', U.alumno3, `select public.reservar($1)`, [s5], /No te quedan clases/);
await as(U.admin, `delete from public.bonos where id = $1`, [caducado]);
await as(U.admin, `update public.hipicas set exigir_bono = false where id = $1`, [h]);
await falla('un alumno no desactiva "exigir bono"', U.alumno, `update public.hipicas set exigir_bono = false where id = $1`, [h], /./);

console.log('Lista de espera');
const sl = await nueva('Llena', 1);
const rLlena = one(await as(U.alumno, `select public.reservar($1)`, [sl]));
await falla('si quedan plazas no hay lista de espera', U.alumno3, `select public.apuntarse_espera($1)`, [s2], /quedan plazas|Ya tienes plaza/);
await falla('quien ya tiene plaza no se apunta a la espera', U.alumno, `select public.apuntarse_espera($1)`, [sl], /Ya tienes plaza/);
const e1 = one(await as(U.alumno3, `select public.apuntarse_espera($1)`, [sl]));
const e2 = one(await as(U.madre, `select public.apuntarse_espera($1, $2)`, [sl, hija]));
check('dos personas se apuntan a la espera', !!e1 && !!e2);
await falla('no se apunta dos veces', U.alumno3, `select public.apuntarse_espera($1)`, [sl], /Ya estás/);
await falla('no apunto a la espera a alguien que no es mío', U.madre, `select public.apuntarse_espera($1, $2)`, [sl, mAlumno3], /No puedes reservar/);
await falla('no se escribe directamente en la lista', U.alumno3, `insert into public.esperas (hipica_id, sesion_id, miembro_id) values ($1, $2, $3)`, [h, sl, mAlumno3], /permission denied/);
let hor = (await as(U.madre, `select * from public.horario($1, now(), now() + interval '7 days') where id = $2`, [h, sl])).rows[0];
check('la madre ve a su hija en la espera, puesto 2', hor.en_espera === 2 && hor.esperas.length === 1 && hor.esperas[0].puesto === 2, JSON.stringify(hor.esperas));
check('la madre no ve quién más espera', !JSON.stringify(hor).includes('Teo'));
await falla('nadie más quita a otro de la espera', U.madre, `select public.salir_espera($1)`, [e1], /No puedes quitar/);
await as(U.alumno, `select public.anular_reserva($1)`, [rLlena]);
const dentro = (await root(`select miembro_id, desde_espera from public.reservas where sesion_id = $1 and estado = 'confirmada'`, [sl])).rows;
check('al anular entra el primero de la espera', dentro.length === 1 && dentro[0].miembro_id === mAlumno3 && dentro[0].desde_espera === true, JSON.stringify(dentro));
hor = (await as(U.madre, `select * from public.horario($1, now(), now() + interval '7 days') where id = $2`, [h, sl])).rows[0];
check('la hija sube al puesto 1', hor.esperas[0]?.puesto === 1 && hor.en_espera === 1);
await as(U.madre, `select public.salir_espera($1)`, [e2]);
check('la madre saca a su hija de la espera', one(await root(`select count(*)::int from public.esperas where sesion_id = $1`, [sl])) === 0);

// Exigir bono + espera: quien no tiene bono se salta
const sx = await nueva('Llena 2', 1);
const rx = one(await as(U.admin, `select public.reservar($1, $2)`, [sx, mAlumno]));
await as(U.alumno3, `select public.apuntarse_espera($1)`, [sx]);
await as(U.madre, `select public.apuntarse_espera($1)`, [sx]);
await as(U.admin, `insert into public.bonos (hipica_id, miembro_id, clases) values ($1, $2, 4)`, [h, mMadre]);
await as(U.admin, `update public.hipicas set exigir_bono = true where id = $1`, [h]);
await as(U.admin, `select public.anular_reserva($1)`, [rx]);
const entra = one(await root(`select miembro_id from public.reservas where sesion_id = $1 and estado = 'confirmada'`, [sx]));
check('con "exigir bono", entra el primero que tenga bono', entra === mMadre);
check('quien no tiene bono sigue esperando', one(await root(`select count(*)::int from public.esperas where sesion_id = $1`, [sx])) === 1);
await as(U.admin, `update public.hipicas set exigir_bono = false where id = $1`, [h]);

// Dar de baja deja entrar a quien espera
const sb = await nueva('Baja', 1);
await as(U.alumno, `select public.reservar($1)`, [sb]);
await as(U.madre, `select public.apuntarse_espera($1, $2)`, [sb, hija]);
await as(U.admin, `select public.dar_de_baja($1)`, [mAlumno]);
check('al dar de baja a alguien, entra quien esperaba', one(await root(`select miembro_id from public.reservas where sesion_id = $1 and estado = 'confirmada'`, [sb])) === hija);

console.log('Caballos en las clases');
const sc = await nueva('Con caballos', 4);
const rc1 = one(await as(U.madre, `select public.reservar($1, $2)`, [sc, hija]));
const rc2 = one(await as(U.alumno3, `select public.reservar($1)`, [sc]));
await as(U.monitor, `select public.asignar_caballo($1, $2)`, [rc1, nube]);
check('el monitor asigna un caballo', one(await root(`select caballo_id from public.reservas where id = $1`, [rc1])) === nube);
await falla('el mismo caballo no va dos veces a la misma clase', U.monitor, `select public.asignar_caballo($1, $2)`, [rc2, nube], /ya está en esta clase/);
await falla('no se asigna un caballo de otra hípica', U.admin, `select public.asignar_caballo($1, $2)`, [rc2, suyo], /no encontrado/);
await falla('un alumno no se elige caballo', U.alumno3, `select public.asignar_caballo($1, $2)`, [rc2, sol], /No puedes asignar/);
await falla('un alumno no toca reservas directamente', U.alumno3, `update public.reservas set caballo_id = $2 where id = $1`, [rc2, sol], /permission denied/);
hor = (await as(U.madre, `select * from public.horario($1, now(), now() + interval '7 days') where id = $2`, [h, sc])).rows[0];
check('la familia ve el caballo de su hija', hor.mias[0]?.caballo === 'Nube', JSON.stringify(hor.mias));
check('y no ve los de los demás', hor.mias.length === 1);
await as(U.madre, `select public.anular_reserva($1)`, [rc1]);
await as(U.monitor, `select public.asignar_caballo($1, $2)`, [rc2, nube]);
check('al anular, el caballo queda libre para otro', one(await root(`select caballo_id from public.reservas where id = $1`, [rc2])) === nube);
await as(U.monitor, `select public.asignar_caballo($1, null)`, [rc2]);
check('se puede quitar el caballo', one(await root(`select caballo_id from public.reservas where id = $1`, [rc2])) === null);

console.log('Tablón');
await as(U.admin, `insert into public.avisos (hipica_id, texto) values ($1, 'Cerrado el viernes')`, [h]);
check('los miembros leen el tablón', (await as(U.alumno3, `select * from public.avisos`)).rows.length === 1);
await falla('un alumno no publica avisos', U.alumno3, `insert into public.avisos (hipica_id, texto) values ($1, 'Spam')`, [h], /row-level security/);
await falla('un monitor no publica avisos', U.monitor, `insert into public.avisos (hipica_id, texto) values ($1, 'X')`, [h], /row-level security/);
await falla('otra hípica no publica en mi tablón', U.adminB, `insert into public.avisos (hipica_id, texto) values ($1, 'X')`, [h], /row-level security/);
check('otra hípica no lee mi tablón', (await as(U.adminB, `select * from public.avisos where hipica_id = $1`, [h])).rows.length === 0);
await falla('un alumno no borra avisos', U.alumno3, `delete from public.avisos`, [], /./);
check('el aviso sigue ahí', one(await root(`select count(*)::int from public.avisos`)) === 1);
await falla('aviso de más de 1000 caracteres', U.admin, `insert into public.avisos (hipica_id, texto) values ($1, repeat('a', 1001))`, [h], /check/);

console.log('Funciones internas no accesibles');
for (const f of [
  `public._crear_reserva('${sc}', '${mAlumno3}', false, true)`,
  `public._promover_espera('${sc}')`,
  `public._bono_disponible('${mAlumno3}', current_date)`,
  `public._bono_usadas('${bonoAlumno}')`,
]) await falla(`no se puede llamar a ${f.split('(')[0]}`, U.alumno3, `select ${f}`, [], /permission denied/);
await falla('anon no ve el horario', null, `select * from public.horario($1, now(), now() + interval '1 day')`, [h], /permission denied/);
await falla('anon no ve bonos', null, `select * from public.estado_bonos($1)`, [h], /permission denied/);

console.log(`\n${ok} correctas, ${fail} fallidas`);
process.exit(fail ? 1 : 0);
