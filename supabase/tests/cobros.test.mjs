// Pruebas de 0010: tarifas, cargos automáticos, recibos y permisos.
//   node supabase/tests/cobros.test.mjs supabase/migrations/*.sql
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
  try { const r = await as(uid, sql, p); check(n, (r.affectedRows ?? 0) === 0 && !r.rows.length, `(no dio error: ${JSON.stringify(r.rows).slice(0, 200)})`); }
  catch (e) { check(n, patron.test(e.message), `(error: ${e.message})`); }
}

const h = one(await as(U.admin, `select public.crear_hipica('Cobros', 'Ana')`));
const hB = one(await as(U.adminB, `select public.crear_hipica('Otra', 'Bea')`));
const tok = one(await as(U.admin, `insert into public.invitaciones (hipica_id) values ($1) returning token`, [h]));
const tokM = one(await as(U.admin, `insert into public.invitaciones (hipica_id, rol, usos_max) values ($1, 'monitor', 1) returning token`, [h]));
await as(U.monitor, `select public.aceptar_invitacion($1, 'Mónica')`, [tokM]);
await as(U.madre, `select public.aceptar_invitacion($1, 'Marta')`, [tok]);
await as(U.otro, `select public.aceptar_invitacion($1, 'Óscar')`, [tok]);
const mMadre = one(await root(`select id from public.miembros where user_id = $1`, [U.madre]));
const mOtro = one(await root(`select id from public.miembros where user_id = $1`, [U.otro]));
const hija = one(await as(U.madre, `select public.anadir_jinete($1, 'Lucía')`, [h]));

console.log('Tarifas');
await as(U.admin, `update public.hipicas set precio_completo = 395, precio_semi = 260 where id = $1`, [h]);
await as(U.admin, `insert into public.tarifas_bonos (hipica_id, clases, precio) values ($1, 8, 120), ($1, 4, 65)`, [h]);
check('las familias ven las tarifas de bonos', (await as(U.madre, `select * from public.tarifas_bonos`)).rows.length === 2);
await falla('una familia no cambia tarifas', U.madre, `update public.tarifas_bonos set precio = 1`, [], /./);
await falla('un monitor no cambia el precio del pupilaje', U.monitor, `update public.hipicas set precio_completo = 1 where id = $1`, [h], /./);

console.log('Cargos automáticos');
const bono = one(await as(U.admin, `insert into public.bonos (hipica_id, miembro_id, clases) values ($1, $2, 8) returning id`, [h, hija]));
let c = (await root(`select cliente_id, importe, mes = date_trunc('month', current_date)::date este_mes from public.cargos where origen_id = $1`, [bono])).rows[0];
check('el bono de la hija se carga a la madre con la tarifa (120 €)', c?.cliente_id === mMadre && Number(c?.importe) === 120 && c?.este_mes, JSON.stringify(c));
await as(U.admin, `insert into public.bonos (hipica_id, miembro_id, clases, cobrar) values ($1, $2, 4, false)`, [h, mOtro]);
check('un bono que no se cobra no genera cargo', one(await root(`select count(*)::int from public.cargos where cliente_id = $1`, [mOtro])) === 0);
await as(U.admin, `insert into public.bonos (hipica_id, miembro_id, clases, precio) values ($1, $2, 4, 50)`, [h, mOtro]);
check('con precio a mano se usa ese precio', Number(one(await root(`select importe from public.cargos where cliente_id = $1`, [mOtro]))) === 50);
const bono2 = one(await as(U.admin, `insert into public.bonos (hipica_id, miembro_id, clases) values ($1, $2, 8) returning id`, [h, mOtro]));
await as(U.admin, `delete from public.bonos where id = $1`, [bono2]);
check('al borrar un bono sin cobrar, se quita su cargo', one(await root(`select count(*)::int from public.cargos where origen_id = $1`, [bono2])) === 0);

const trueno = one(await as(U.admin, `insert into public.caballos (hipica_id, nombre, tipo, propietario_id, pupilaje) values ($1, 'Trueno', 'propietario', $2, 'completo') returning id`, [h, mMadre]));
const ducha = one(await as(U.admin, `insert into public.servicios (hipica_id, nombre, precio) values ($1, 'Ducha', 5) returning id`, [h]));
const herrador = one(await as(U.admin, `insert into public.servicios (hipica_id, nombre) values ($1, 'Herrador') returning id`, [h]));
const sol = one(await as(U.madre, `select public.pedir_servicios($1, array[$2]::uuid[], current_date)`, [trueno, ducha]));
check('pedir un servicio todavía no cobra nada', one(await root(`select count(*)::int from public.cargos where origen_id = $1`, [sol])) === 0);
await as(U.monitor, `select public.responder_solicitud($1, 'aceptada')`, [sol]);
check('al aceptarlo se carga a la propietaria', Number(one(await root(`select importe from public.cargos where origen_id = $1`, [sol]))) === 5);
await as(U.monitor, `select public.responder_solicitud($1, 'hecha')`, [sol]);
check('al hacerlo no se cobra dos veces', one(await root(`select count(*)::int from public.cargos where origen_id = $1`, [sol])) === 1);
const sol2 = one(await as(U.madre, `select public.pedir_servicios($1, array[$2]::uuid[], current_date)`, [trueno, ducha]));
await as(U.monitor, `select public.responder_solicitud($1, 'aceptada')`, [sol2]);
await as(U.monitor, `select public.responder_solicitud($1, 'rechazada')`, [sol2]);
check('si después se rechaza, se quita el cargo', one(await root(`select count(*)::int from public.cargos where origen_id = $1`, [sol2])) === 0);
const sol3 = one(await as(U.madre, `select public.pedir_servicios($1, array[$2]::uuid[], current_date)`, [trueno, herrador]));
await as(U.monitor, `select public.responder_solicitud($1, 'aceptada')`, [sol3]);
check('un servicio "según tarifa" no genera cargo (lo pone el admin)', one(await root(`select count(*)::int from public.cargos where origen_id = $1`, [sol3])) === 0);

console.log('Cargos a mano');
await as(U.admin, `insert into public.cargos (hipica_id, cliente_id, mes, concepto, importe) values ($1, $2, date_trunc('month', current_date), 'Herrador · Trueno', 60)`, [h, mMadre]);
check('el admin añade un cargo a mano', one(await root(`select count(*)::int from public.cargos where concepto = 'Herrador · Trueno'`)) === 1);
await falla('una familia no se pone cargos (ni negativos)', U.madre, `insert into public.cargos (hipica_id, cliente_id, mes, concepto, importe) values ($1, $2, date_trunc('month', current_date), 'Descuento', -500)`, [h, mMadre], /row-level security/);
await falla('un monitor tampoco', U.monitor, `insert into public.cargos (hipica_id, cliente_id, mes, concepto, importe) values ($1, $2, date_trunc('month', current_date), 'X', 1)`, [h, mMadre], /row-level security/);
await falla('el admin no inventa cargos "de bono"', U.admin, `insert into public.cargos (hipica_id, cliente_id, mes, concepto, importe, origen) values ($1, $2, date_trunc('month', current_date), 'X', 1, 'bono')`, [h, mMadre], /row-level security/);
await falla('no se carga a un cliente de otra hípica', U.adminB, `insert into public.cargos (hipica_id, cliente_id, mes, concepto, importe) values ($1, $2, date_trunc('month', current_date), 'X', 1)`, [hB, mMadre], /foreign key/);

console.log('Recibos');
await falla('un monitor no genera recibos', U.monitor, `select public.generar_recibos($1, current_date)`, [h], /Solo el administrador/);
await falla('no se generan recibos de dentro de un año', U.admin, `select public.generar_recibos($1, current_date + 400)`, [h], /no válido/);
const n = one(await as(U.admin, `select public.generar_recibos($1, date_trunc('month', current_date)::date)`, [h]));
check('se generan dos recibos (madre y Óscar)', n === 2, String(n));
const rec = (await root(`select id, total, estado, numero from public.recibos where cliente_id = $1`, [mMadre])).rows[0];
check('el de la madre suma bono 120 + ducha 5 + herrador 60 + pupilaje 395 = 580 €', Number(rec?.total) === 580, JSON.stringify(rec));
check('generar otra vez no duplica nada', one(await as(U.admin, `select public.generar_recibos($1, date_trunc('month', current_date)::date)`, [h])) === 0
  && Number(one(await root(`select total from public.recibos where id = $1`, [rec.id]))) === 580);
check('la madre ve su recibo y sus cargos', (await as(U.madre, `select * from public.recibos`)).rows.length === 1 && (await as(U.madre, `select * from public.cargos`)).rows.length === 4);
check('y no los de otros', !(await as(U.madre, `select cliente_id from public.cargos`)).rows.some(r => r.cliente_id !== mMadre));
check('un monitor no ve el dinero', (await as(U.monitor, `select * from public.recibos`)).rows.length === 0 && (await as(U.monitor, `select * from public.cargos`)).rows.length === 0);
check('otra hípica no ve mis recibos', (await as(U.adminB, `select * from public.recibos`)).rows.length === 0);
await falla('la madre no se marca como pagada', U.madre, `select public.marcar_recibo($1, 'pagado', 'bizum')`, [rec.id], /No puedes/);
await falla('ni a mano', U.madre, `update public.recibos set estado = 'pagado' where id = $1`, [rec.id], /permission denied/);
await falla('método inventado', U.admin, `select public.marcar_recibo($1, 'pagado', 'trueque')`, [rec.id], /no válido/);

await as(U.admin, `insert into public.cargos (hipica_id, cliente_id, mes, concepto, importe) values ($1, $2, date_trunc('month', current_date), 'Dentista', 40)`, [h, mMadre]);
await as(U.admin, `select public.generar_recibos($1, date_trunc('month', current_date)::date)`, [h]);
check('un cargo nuevo se suma al recibo pendiente', Number(one(await root(`select total from public.recibos where id = $1`, [rec.id]))) === 620);
const dentista = one(await root(`select id from public.cargos where concepto = 'Dentista'`));
await as(U.admin, `select public.quitar_cargo($1)`, [dentista]);
check('quitar un cargo de un recibo pendiente recalcula el total', Number(one(await root(`select total from public.recibos where id = $1`, [rec.id]))) === 580);
await falla('un cargo de un recibo no se borra a mano', U.admin, `delete from public.cargos where recibo_id = $1`, [rec.id], /./);

await as(U.admin, `select public.marcar_recibo($1, 'pagado', 'bizum')`, [rec.id]);
let r2 = (await root(`select estado, metodo, pagado_en = current_date hoy from public.recibos where id = $1`, [rec.id])).rows[0];
check('el admin lo marca como pagado por Bizum', r2.estado === 'pagado' && r2.metodo === 'bizum' && r2.hoy);
await falla('de un recibo pagado no se quitan cargos', U.admin, `select public.quitar_cargo(id) from public.cargos where recibo_id = $1 limit 1`, [rec.id], /ya está cobrado/);
await as(U.admin, `insert into public.cargos (hipica_id, cliente_id, mes, concepto, importe) values ($1, $2, date_trunc('month', current_date), 'Mantas', 15)`, [h, mMadre]);
await as(U.admin, `select public.generar_recibos($1, date_trunc('month', current_date)::date)`, [h]);
check('lo nuevo no se mete en un recibo ya pagado: espera al mes que viene', Number(one(await root(`select total from public.recibos where id = $1`, [rec.id]))) === 580
  && one(await root(`select recibo_id from public.cargos where concepto = 'Mantas'`)) === null);
await as(U.admin, `select public.generar_recibos($1, (date_trunc('month', current_date) + interval '1 month')::date)`, [h]);
const sig = (await root(`select total from public.recibos where cliente_id = $1 and mes > date_trunc('month', current_date)`, [mMadre])).rows[0];
check('el mes siguiente lleva las mantas y el pupilaje', Number(sig?.total) === 15 + 395, JSON.stringify(sig));
await as(U.admin, `select public.marcar_recibo($1, 'devuelto', null)`, [rec.id]);
check('se puede marcar como devuelto', one(await root(`select estado from public.recibos where id = $1`, [rec.id])) === 'devuelto');

console.log('Datos de factura');
await as(U.madre, `update public.miembros set datos_factura = 'Marta · 1234Z' where id = $1`, [mMadre]);
check('la madre rellena sus datos de factura', one(await root(`select datos_factura from public.miembros where id = $1`, [mMadre])) === 'Marta · 1234Z');
await falla('un monitor no los cambia', U.monitor, `update public.miembros set datos_factura = 'X' where id = $1`, [mMadre], /Solo el administrador/);
await falla('otro alumno tampoco', U.otro, `update public.miembros set datos_factura = 'X' where id = $1`, [mMadre], /./);
await falla('funciones internas no accesibles', U.admin, `select public._generar_recibos($1, current_date)`, [h], /permission denied/);

console.log(`\n${ok} correctas, ${fail} fallidas`);
process.exit(fail ? 1 : 0);
