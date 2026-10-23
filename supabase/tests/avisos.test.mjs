// Pruebas de 0011: avisos por evento, recordatorios, envío y permisos.
//   node supabase/tests/avisos.test.mjs supabase/migrations/*.sql
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
  monitor: '00000000-0000-0000-0000-00000000000c',
  mozo: '00000000-0000-0000-0000-00000000000d',
  madre: '00000000-0000-0000-0000-000000000001',
  otro: '00000000-0000-0000-0000-000000000002',
  nueva: '00000000-0000-0000-0000-000000000003',
  adminB: '00000000-0000-0000-0000-00000000000b',
};
for (const [k, id] of Object.entries(U)) await db.query('insert into auth.users (id, email) values ($1, $2)', [id, `${k}@example.com`]);

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
const avisos = async (uid) => (await as(uid, `select titulo, texto, url from public.notificaciones order by created_at, titulo`)).rows;
const ultimo = async (uid) => (await avisos(uid)).at(-1);
const cuantos = async (uid) => (await avisos(uid)).length;
const secreto = one(await root(`select valor from privado.ajustes where clave = 'secreto_avisos'`));

const h = one(await as(U.admin, `select public.crear_hipica('La Dehesa', 'Ana')`));
const hB = one(await as(U.adminB, `select public.crear_hipica('Otra', 'Bea')`));
const tok = one(await as(U.admin, `insert into public.invitaciones (hipica_id) values ($1) returning token`, [h]));
const tokM = one(await as(U.admin, `insert into public.invitaciones (hipica_id, rol, usos_max) values ($1, 'monitor', 1) returning token`, [h]));
const tokC = one(await as(U.admin, `insert into public.invitaciones (hipica_id, rol, usos_max) values ($1, 'cuadra', 1) returning token`, [h]));
await as(U.monitor, `select public.aceptar_invitacion($1, 'Mónica')`, [tokM]);
await as(U.mozo, `select public.aceptar_invitacion($1, 'Paco')`, [tokC]);
await as(U.madre, `select public.aceptar_invitacion($1, 'Marta López')`, [tok]);
await as(U.otro, `select public.aceptar_invitacion($1, 'Óscar')`, [tok]);
const mMadre = one(await root(`select id from public.miembros where user_id = $1`, [U.madre]));
const mOtro = one(await root(`select id from public.miembros where user_id = $1`, [U.otro]));
const hija = one(await as(U.madre, `select public.anadir_jinete($1, 'Lucía López')`, [h]));
const sinCuenta = one(await as(U.admin, `select public.anadir_alumno_sin_cuenta($1, 'Pedro', '600')`, [h]));

console.log('Secreto');
check('la migración crea un secreto largo', typeof secreto === 'string' && secreto.length >= 32);
await falla('nadie lee el secreto', U.admin, `select valor from privado.ajustes`, [], /permission denied/);

console.log('Tablón');
await as(U.admin, `insert into public.avisos (hipica_id, texto) values ($1, 'El viernes la pista exterior está cerrada')`, [h]);
check('a la madre le llega el aviso del tablón', (await ultimo(U.madre))?.titulo === 'Aviso de La Dehesa');
check('al monitor y al mozo también', (await cuantos(U.monitor)) === 1 && (await cuantos(U.mozo)) === 1);
check('a quien lo escribe no', (await cuantos(U.admin)) === 0);
check('a la otra hípica no', (await cuantos(U.adminB)) === 0);

console.log('Lista de espera y cancelaciones');
const ses = one(await as(U.admin, `insert into public.sesiones (hipica_id, titulo, inicio, fin, plazas)
  values ($1, 'Ponis', now() + interval '3 days', now() + interval '3 days 1 hour', 1) returning id`, [h]));
const res = one(await as(U.madre, `select public.reservar($1, $2)`, [ses, hija]));
await as(U.otro, `select public.apuntarse_espera($1)`, [ses]);
const antes = await cuantos(U.otro);
await as(U.madre, `select public.anular_reserva($1)`, [res]);
let a = await ultimo(U.otro);
check('al anular, el de la lista de espera recibe "Tienes plaza"', (await cuantos(U.otro)) === antes + 1 && a?.titulo === 'Tienes plaza' && /Ponis del \S+ \d+ a las \d\d:\d\d/.test(a?.texto), JSON.stringify(a));
check('el aviso lleva a la app', a?.url === `/hipica/${h}`);
await as(U.admin, `update public.sesiones set cancelada = true where id = $1`, [ses]);
a = await ultimo(U.otro);
check('al cancelar la clase, avisa a quien tenía plaza', a?.titulo === 'Clase cancelada' && a?.texto.startsWith('Ponis del'), JSON.stringify(a));
check('a la madre (ya anuló) no le llega la cancelación', !(await avisos(U.madre)).some((x) => x.titulo.startsWith('Clase cancelada')));
await as(U.admin, `update public.sesiones set cancelada = false where id = $1`, [ses]);
check('al recuperarla también avisa', (await ultimo(U.otro))?.titulo === 'Clase recuperada');
await as(U.admin, `update public.sesiones set titulo = 'Ponis (pista 2)' where id = $1`, [ses]);
check('cambiar otra cosa de la clase no avisa', (await ultimo(U.otro))?.titulo === 'Clase recuperada' && (await cuantos(U.otro)) === antes + 3);

console.log('Hijos y alumnos sin cuenta');
const ses2 = one(await as(U.admin, `insert into public.sesiones (hipica_id, titulo, inicio, fin, plazas)
  values ($1, 'Salto', now() + interval '4 days', now() + interval '4 days 1 hour', 5) returning id`, [h]));
await as(U.madre, `select public.reservar($1, $2)`, [ses2, hija]);
await as(U.admin, `select public.reservar($1, $2)`, [ses2, sinCuenta]);
await as(U.admin, `update public.sesiones set cancelada = true where id = $1`, [ses2]);
check('lo de la hija le llega a la madre con el nombre de la hija', (await ultimo(U.madre))?.titulo === 'Clase cancelada · Lucía');
check('el alumno sin cuenta no genera avisos', one(await root(`select count(*)::int from public.notificaciones where miembro_id = $1`, [sinCuenta])) === 0);
const pasada = one(await as(U.admin, `insert into public.sesiones (hipica_id, titulo, inicio, fin, plazas)
  values ($1, 'Vieja', now() - interval '2 days', now() - interval '2 days' + interval '1 hour', 5) returning id`, [h]));
const nAntes = await cuantos(U.madre);
await as(U.admin, `update public.sesiones set cancelada = true where id = $1`, [pasada]);
check('cancelar una clase pasada no avisa', (await cuantos(U.madre)) === nAntes);

console.log('Recibos');
await as(U.admin, `insert into public.bonos (hipica_id, miembro_id, clases, precio) values ($1, $2, 8, 120)`, [h, hija]);
await as(U.admin, `select public.generar_recibos($1, current_date)`, [h]);
a = await ultimo(U.madre);
check('al generar recibos, la madre recibe el suyo con el total', /^Recibo de \w+/.test(a?.titulo) && a?.texto.includes('120,00 €') && a?.url === `/hipica/${h}/familia`, JSON.stringify(a));
const nRec = await cuantos(U.madre);
await as(U.admin, `select public.generar_recibos($1, current_date)`, [h]);
check('generar otra vez no repite el aviso', (await cuantos(U.madre)) === nRec);

console.log('Cuidados');
const trueno = one(await as(U.admin, `insert into public.caballos (hipica_id, nombre, tipo, propietario_id) values ($1, 'Trueno', 'propietario', $2) returning id`, [h, mMadre]));
const lucero = one(await as(U.admin, `insert into public.caballos (hipica_id, nombre) values ($1, 'Lucero') returning id`, [h]));
await as(U.admin, `insert into public.cuidados (hipica_id, caballo_id, tipo, fecha) values ($1, $2, 'herrador', current_date + 5)`, [h, trueno]);
a = await ultimo(U.madre);
check('herrador próximo: la propietaria tiene que decidir', a?.titulo === 'Herrador para Trueno' && /Lo hace la hípica/.test(a?.texto) && a?.url === `/hipica/${h}/caballos/${trueno}`, JSON.stringify(a));
const nCui = await cuantos(U.madre);
await as(U.admin, `insert into public.cuidados (hipica_id, caballo_id, tipo, fecha) values ($1, $2, 'vacuna', current_date + 60)`, [h, trueno]);
await as(U.admin, `insert into public.cuidados (hipica_id, caballo_id, tipo, fecha, responsable) values ($1, $2, 'dentista', current_date + 3, 'hipica')`, [h, trueno]);
await as(U.admin, `insert into public.cuidados (hipica_id, caballo_id, tipo, fecha) values ($1, $2, 'herrador', current_date + 3)`, [h, lucero]);
check('no avisa de lo lejano, de lo ya decidido ni de los caballos de escuela', (await cuantos(U.madre)) === nCui);

console.log('Servicios');
const ducha = one(await as(U.admin, `insert into public.servicios (hipica_id, nombre, precio) values ($1, 'Ducha', 5) returning id`, [h]));
const sol = one(await as(U.madre, `select public.pedir_servicios($1, array[$2]::uuid[], current_date + 1)`, [trueno, ducha]));
a = await ultimo(U.admin);
check('al pedir un servicio se avisa al admin', a?.titulo === 'Servicio pedido · Trueno' && a?.texto.startsWith('Ducha para el'), JSON.stringify(a));
check('y a la cuadra', (await ultimo(U.mozo))?.titulo === 'Servicio pedido · Trueno');
check('al monitor no', !(await avisos(U.monitor)).some((x) => x.titulo.startsWith('Servicio')));
check('a quien lo pide no', !(await avisos(U.madre)).some((x) => x.titulo.startsWith('Servicio pedido')));
await as(U.monitor, `select public.responder_solicitud($1, 'aceptada')`, [sol]);
check('al aceptarlo se avisa a la propietaria', (await ultimo(U.madre))?.titulo === 'Servicio aceptado · Trueno');
const nSol = await cuantos(U.madre);
await as(U.monitor, `select public.responder_solicitud($1, 'hecha')`, [sol]);
check('marcarlo como hecho no avisa otra vez', (await cuantos(U.madre)) === nSol);

console.log('Altas');
await as(U.admin, `update public.hipicas set revisar_altas = true where id = $1`, [h]);
await as(U.nueva, `select public.solicitar_alta($1, 'Nora Gil', '611', '[{"nombre": "Nora Gil", "yo": true}]'::jsonb)`, [tok]);
check('alta nueva: aviso al admin', (await ultimo(U.admin))?.titulo === 'Alta por revisar');
check('al mozo no', !(await avisos(U.mozo)).some((x) => x.titulo === 'Alta por revisar'));

console.log('Permisos');
const deMadre = one(await root(`select id from public.notificaciones where miembro_id = $1 limit 1`, [mMadre]));
check('nadie ve los avisos de otro', (await as(U.otro, `select * from public.notificaciones where id = $1`, [deMadre])).rows.length === 0);
check('el admin tampoco ve los avisos de las familias', (await as(U.admin, `select * from public.notificaciones where id = $1`, [deMadre])).rows.length === 0);
await falla('nadie se crea avisos a mano', U.madre, `insert into public.notificaciones (hipica_id, miembro_id, titulo, texto) values ($1, $2, 'x', 'y')`, [h, mOtro], /permission denied/);
await falla('ni los borra', U.madre, `delete from public.notificaciones`, [], /permission denied/);
await falla('ni los cambia', U.madre, `update public.notificaciones set titulo = 'x'`, [], /permission denied/);
await falla('el anónimo no ve nada', null, `select * from public.notificaciones`, [], /permission denied/);
await as(U.otro, `select public.marcar_avisos_leidos($1)`, [h]);
check('marcar como leídos solo toca los propios', one(await root(`select count(*)::int from public.notificaciones where miembro_id = $1 and leida_en is not null`, [mMadre])) === 0
  && one(await root(`select count(*)::int from public.notificaciones where miembro_id = $1 and leida_en is null`, [mOtro])) === 0);
await falla('una función interna no se llama desde fuera', U.madre, `select public._avisar($1, 'x', 'y', '')`, [mOtro], /permission denied/);

console.log('Recordatorios');
const manana = one(await as(U.admin, `insert into public.sesiones (hipica_id, titulo, inicio, fin, plazas)
  values ($1, 'Iniciación', date_trunc('day', now() at time zone 'Europe/Madrid') + interval '1 day 18 hours', date_trunc('day', now() at time zone 'Europe/Madrid') + interval '1 day 19 hours', 5) returning id`, [h]));
await root(`update public.sesiones set inicio = (date_trunc('day', now() at time zone 'Europe/Madrid') + interval '1 day 18 hours') at time zone 'Europe/Madrid',
  fin = (date_trunc('day', now() at time zone 'Europe/Madrid') + interval '1 day 19 hours') at time zone 'Europe/Madrid' where id = $1`, [manana]);
const resM = one(await as(U.madre, `select public.reservar($1, $2)`, [manana, hija]));
await root(`update public.reservas set caballo_id = $1 where id = $2`, [lucero, resM]);
await as(U.admin, `insert into public.cuidados (hipica_id, caballo_id, tipo, fecha) values ($1, $2, 'vacuna', current_date + 2)`, [h, trueno]);
await falla('sin secreto no hay recordatorios', U.madre, `select public.recordatorios_diarios('x')`, [], /No autorizado/);
const n1 = one(await as(null, `select public.recordatorios_diarios($1)`, [secreto]));
a = (await avisos(U.madre)).find((x) => x.titulo === 'Mañana tienes clase · Lucía');
check('recordatorio de la clase de mañana, con hora y caballo', a?.texto === 'Iniciación a las 18:00, con Lucero. Si no puedes ir, anúlala en la app.', JSON.stringify(a));
check('recordatorio del cuidado de pasado mañana', (await avisos(U.madre)).some((x) => x.titulo === 'Vacuna para Trueno' && x.texto.startsWith('Es pasado mañana')));
const nR = await cuantos(U.madre);
await as(null, `select public.recordatorios_diarios($1)`, [secreto]);
check('ejecutarlo otra vez no repite', (await cuantos(U.madre)) === nR && n1 >= 2);
await as(U.admin, `update public.hipicas set recordar_clases = false where id = $1`, [h]);
await root(`delete from public.notificaciones where clave like 'recordatorio:%'`);
await as(null, `select public.recordatorios_diarios($1)`, [secreto]);
check('si la hípica los desactiva, no se recuerdan las clases', !(await avisos(U.madre)).some((x) => x.titulo.startsWith('Mañana')));

console.log('Móviles (push)');
const ep = 'https://fcm.googleapis.com/fcm/send/abc123';
await falla('no se guarda una dirección que no sea de un servicio de push', U.madre, `select public.guardar_suscripcion('https://evil.example.com/x', 'k', 'a')`, [], /suscripciones_endpoint_check|check constraint/);
await falla('ni una http', U.madre, `select public.guardar_suscripcion('http://fcm.googleapis.com/x', 'k', 'a')`, [], /check/);
await falla('ni algo que se parezca', U.madre, `select public.guardar_suscripcion('https://fcm.googleapis.com.evil.com/x', 'k', 'a')`, [], /check/);
await falla('el anónimo no guarda móviles', null, `select public.guardar_suscripcion($1, 'k', 'a')`, [ep], /permission denied/);
await as(U.madre, `select public.guardar_suscripcion($1, 'k1', 'a1')`, [ep]);
await as(U.madre, `select public.guardar_suscripcion('https://web.push.apple.com/QWER', 'k2', 'a2')`);
check('la madre ve sus dos móviles', (await as(U.madre, `select * from public.suscripciones`)).rows.length === 2);
check('otro no los ve', (await as(U.otro, `select * from public.suscripciones`)).rows.length === 0);
await as(U.otro, `select public.borrar_suscripcion($1)`, [ep]);
check('ni los borra', one(await root(`select count(*)::int from public.suscripciones where endpoint = $1`, [ep])) === 1);
await falla('ni los toca directamente', U.otro, `update public.suscripciones set user_id = $1`, [U.otro], /permission denied/);

console.log('Envío');
await falla('sin secreto no se cogen avisos', null, `select * from public.tomar_avisos('nope', 10)`, [], /No autorizado/);
await falla('ni con un secreto corto', null, `select * from public.tomar_avisos('', 10)`, [], /No autorizado/);
await as(U.otro, `select public.cambiar_avisos_email(false)`);
const lote = (await as(null, `select * from public.tomar_avisos($1, 500)`, [secreto])).rows;
const deM = lote.filter((x) => x.email === 'madre@example.com');
check('el servidor coge los avisos con email y móviles', deM.length > 3 && deM[0].suscripciones.length === 2 && deM[0].hipica === 'La Dehesa', JSON.stringify(deM[0]).slice(0, 300));
check('quien quitó los emails no los recibe', lote.filter((x) => x.texto.includes('Ponis')).every((x) => x.email === null));
check('cogerlos otra vez no devuelve nada (no se envían dos veces)', (await as(null, `select * from public.tomar_avisos($1, 500)`, [secreto])).rows.length === 0);
await as(U.madre, `select public.guardar_suscripcion($1, 'k1', 'a1')`, [ep]);
await as(U.otro, `select public.guardar_suscripcion($1, 'k9', 'a9')`, [ep]);
check('si el móvil cambia de cuenta, pasa a la nueva', one(await root(`select user_id from public.suscripciones where endpoint = $1`, [ep])) === U.otro);
await as(null, `select public.quitar_suscripcion_caducada($1, $2)`, [secreto, ep]);
check('el servidor borra un móvil caducado', one(await root(`select count(*)::int from public.suscripciones where endpoint = $1`, [ep])) === 0);
await falla('sin secreto no se borra nada', null, `select public.quitar_suscripcion_caducada('x', 'https://web.push.apple.com/QWER')`, [], /No autorizado/);

console.log('Demo');
await root(`update public.hipicas set es_demo = true where id = $1`, [hB]);
await as(U.adminB, `insert into public.avisos (hipica_id, texto) values ($1, 'hola')`, [hB]);
const tB = one(await as(U.adminB, `insert into public.invitaciones (hipica_id) values ($1) returning token`, [hB]));
await as(U.nueva, `select public.aceptar_invitacion($1, 'Nora')`, [tB]);
await as(U.adminB, `insert into public.avisos (hipica_id, texto) values ($1, 'hola otra vez')`, [hB]);
check('en la demo el aviso se ve dentro de la app', (await avisos(U.nueva)).some((x) => x.texto === 'hola otra vez'));
check('pero no sale por push ni email', (await as(null, `select * from public.tomar_avisos($1, 500)`, [secreto])).rows.length === 0);

console.log(`\n${ok} bien, ${fail} mal`);
process.exit(fail ? 1 : 0);
