-- =====================================================================
-- 0011 · Avisos
--
-- Cuando pasa algo que le importa a alguien, se le deja un aviso:
--   * Familias: clase cancelada o recuperada, plaza desde la lista de
--     espera, recordatorio de la clase de mañana, recibo nuevo, cuidado de
--     su caballo por decidir, servicio aceptado o rechazado, tablón.
--   * Equipo: servicio pedido (admin y cuadra), alta por revisar (admin).
--
-- Los avisos se ven dentro de la app (campana) y, además, la web los manda
-- al móvil (notificación push) y por email. Para eso, el servidor llama a
-- tomar_avisos() con un secreto que solo conocen la base de datos y el
-- servidor (privado.ajustes). Así no hace falta la clave service_role.
--
-- Un jinete sin cuenta (un hijo) avisa a su titular. Un alumno sin cuenta
-- ni titular no recibe nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Secreto del servidor
-- ---------------------------------------------------------------------
create schema if not exists privado;
revoke all on schema privado from public;
create table privado.ajustes (
  clave text primary key,
  valor text not null
);
revoke all on privado.ajustes from public;
revoke all on privado.ajustes from anon, authenticated;
-- Sin políticas: nadie la lee desde la API; solo las funciones del servidor.
alter table privado.ajustes enable row level security;

-- 64 caracteres aleatorios. Se copia a Vercel como CRON_SECRET:
--   select valor from privado.ajustes where clave = 'secreto_avisos';
insert into privado.ajustes (clave, valor)
values ('secreto_avisos', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''));

create function public._comprobar_secreto(p_secreto text)
returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_secreto is null or char_length(p_secreto) < 32
     or p_secreto is distinct from (select valor from privado.ajustes where clave = 'secreto_avisos') then
    raise exception 'No autorizado';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Tablas
-- ---------------------------------------------------------------------
alter table public.miembros add column avisos_email boolean not null default true;
alter table public.hipicas add column recordar_clases boolean not null default true;
grant update (recordar_clases) on public.hipicas to authenticated;

create table public.notificaciones (
  id         uuid primary key default gen_random_uuid(),
  hipica_id  uuid not null references public.hipicas (id) on delete cascade,
  miembro_id uuid not null,                       -- quien lo recibe (siempre con cuenta)
  titulo     text not null check (char_length(titulo) between 1 and 120),
  texto      text not null check (char_length(texto) <= 500),
  url        text not null default '' check (url = '' or url ~ '^/[^/]'),
  clave      text,                                -- evita repetir recordatorios
  created_at timestamptz not null default now(),
  leida_en   timestamptz,
  enviada_en timestamptz,                         -- push/email ya intentados
  foreign key (miembro_id, hipica_id) references public.miembros (id, hipica_id) on delete cascade
);
create index notificaciones_miembro_idx on public.notificaciones (miembro_id, created_at desc);
create index notificaciones_por_enviar_idx on public.notificaciones (created_at) where enviada_en is null;
create unique index notificaciones_clave_idx on public.notificaciones (miembro_id, clave) where clave is not null;

alter table public.notificaciones enable row level security;
create policy notificaciones_select on public.notificaciones
  for select to authenticated
  using (exists (select 1 from public.miembros m where m.id = miembro_id and m.user_id = (select auth.uid())));
revoke all on public.notificaciones from anon, authenticated;
grant select on public.notificaciones to authenticated;

-- Móviles y ordenadores que reciben notificaciones (Web Push).
-- Solo se aceptan los servicios de push de los navegadores: así el servidor
-- nunca manda peticiones a una dirección que haya escrito un usuario.
create table public.suscripciones (
  endpoint   text primary key check (
    char_length(endpoint) <= 1000 and endpoint ~ (
      '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|'
      || '([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)/')
  ),
  user_id    uuid not null references auth.users (id) on delete cascade,
  p256dh     text not null check (char_length(p256dh) between 1 and 200),
  auth       text not null check (char_length(auth) between 1 and 100),
  created_at timestamptz not null default now()
);
create index suscripciones_user_idx on public.suscripciones (user_id);
alter table public.suscripciones enable row level security;
create policy suscripciones_propias on public.suscripciones
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.suscripciones from anon, authenticated;
grant select on public.suscripciones to authenticated;

-- ---------------------------------------------------------------------
-- 3. Textos: fechas en español y nombres de los cuidados
-- ---------------------------------------------------------------------
create function public._dia_semana(p_fecha date)
returns text language sql immutable set search_path = ''
as $$
  select (array['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'])[extract(dow from p_fecha)::int + 1]
$$;

-- "viernes 23 de octubre"
create function public._dia(p_fecha date)
returns text language sql immutable set search_path = ''
as $$
  select public._dia_semana(p_fecha) || ' ' || extract(day from p_fecha)::int || ' de '
    || (array['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
              'septiembre', 'octubre', 'noviembre', 'diciembre'])[extract(month from p_fecha)::int]
$$;

-- "viernes 23 a las 17:30" (en la hora de la hípica)
create function public._cuando(p_inicio timestamptz, p_tz text)
returns text language sql stable set search_path = ''
as $$
  select public._dia_semana((p_inicio at time zone p_tz)::date) || ' '
    || extract(day from p_inicio at time zone p_tz)::int || ' a las '
    || to_char(p_inicio at time zone p_tz, 'HH24:MI')
$$;

create function public._nombre_cuidado(p_tipo text)
returns text language sql immutable set search_path = ''
as $$
  select case p_tipo
    when 'herrador' then 'Herrador' when 'vacuna' then 'Vacuna'
    when 'desparasitacion' then 'Desparasitación' when 'dentista' then 'Dentista'
    when 'veterinario' then 'Veterinario' else 'Cuidado' end
$$;

-- ---------------------------------------------------------------------
-- 4. Dejar un aviso
-- ---------------------------------------------------------------------
-- A quién le llega lo de un miembro: a él si tiene cuenta, o a su titular.
create function public._destinatario(p_miembro uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select case
    when m.user_id is not null then m.id
    when t.user_id is not null and t.activo then t.id
  end
  from public.miembros m
  left join public.miembros t on t.id = m.titular_id
  where m.id = p_miembro and m.activo
$$;

-- Si el aviso es de un hijo, el título lleva su nombre ("Clase cancelada · Lucía").
create function public._avisar(p_miembro uuid, p_titulo text, p_texto text, p_url text, p_clave text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_dest   uuid := public._destinatario(p_miembro);
  v_hipica uuid;
  v_titulo text := p_titulo;
begin
  if v_dest is null then
    return;
  end if;
  select hipica_id into v_hipica from public.miembros where id = v_dest;
  if v_dest <> p_miembro then
    v_titulo := v_titulo || ' · ' || split_part((select nombre from public.miembros where id = p_miembro), ' ', 1);
  end if;
  insert into public.notificaciones (hipica_id, miembro_id, titulo, texto, url, clave)
  values (v_hipica, v_dest, left(v_titulo, 120), left(coalesce(p_texto, ''), 500), coalesce(p_url, ''), p_clave)
  on conflict (miembro_id, clave) where clave is not null do nothing;
end;
$$;

-- A todo el equipo con ciertos roles (por ejemplo, admin y cuadra).
create function public._avisar_equipo(p_hipica uuid, p_roles text[], p_titulo text, p_texto text, p_url text)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.notificaciones (hipica_id, miembro_id, titulo, texto, url)
  select p_hipica, m.id, left(p_titulo, 120), left(p_texto, 500), p_url
  from public.miembros m
  where m.hipica_id = p_hipica and m.activo and m.user_id is not null
    and m.rol::text = any (p_roles)
    and m.user_id is distinct from (select auth.uid())     -- a quien lo hace no se le avisa
$$;

-- ---------------------------------------------------------------------
-- 5. Qué genera avisos
-- ---------------------------------------------------------------------
-- Clase cancelada (o recuperada): a quien tenía plaza.
create function public.aviso_sesion()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_tz text;
  r    record;
begin
  if new.cancelada is not distinct from old.cancelada or new.inicio <= now() then
    return null;
  end if;
  select zona_horaria into v_tz from public.hipicas where id = new.hipica_id;
  for r in select miembro_id from public.reservas where sesion_id = new.id and estado = 'confirmada' loop
    if new.cancelada then
      perform public._avisar(r.miembro_id, 'Clase cancelada',
        new.titulo || ' del ' || public._cuando(new.inicio, v_tz) || ' se ha cancelado. No se descuenta del bono.',
        '/hipica/' || new.hipica_id || '/horario');
    else
      perform public._avisar(r.miembro_id, 'Clase recuperada',
        new.titulo || ' del ' || public._cuando(new.inicio, v_tz) || ' vuelve a estar en pie. Mantienes tu plaza.',
        '/hipica/' || new.hipica_id || '/horario');
    end if;
  end loop;
  return null;
end;
$$;
create trigger aviso_sesion after update of cancelada on public.sesiones
  for each row execute function public.aviso_sesion();

-- Plaza desde la lista de espera.
create function public.aviso_reserva()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  s    public.sesiones%rowtype;
  v_tz text;
begin
  if not new.desde_espera or new.estado <> 'confirmada'
     or (tg_op = 'UPDATE' and old.estado = 'confirmada' and old.desde_espera) then
    return null;
  end if;
  select * into s from public.sesiones where id = new.sesion_id;
  select zona_horaria into v_tz from public.hipicas where id = new.hipica_id;
  perform public._avisar(new.miembro_id, 'Tienes plaza',
    'Ha quedado un hueco en ' || s.titulo || ' del ' || public._cuando(s.inicio, v_tz)
      || ' y has entrado desde la lista de espera. Si no puedes ir, anúlala.',
    '/hipica/' || new.hipica_id);
  return null;
end;
$$;
create trigger aviso_reserva after insert or update of estado, desde_espera on public.reservas
  for each row execute function public.aviso_reserva();

-- Recibo nuevo. Se mira al terminar la transacción, cuando ya tiene su total.
create function public.aviso_recibo()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  r public.recibos%rowtype;
begin
  select * into r from public.recibos where id = new.id;
  if not found or r.estado <> 'pendiente' or r.total <= 0 then
    return null;
  end if;
  perform public._avisar(r.cliente_id, 'Recibo de ' || (array['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
      'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'])[extract(month from r.mes)::int],
    'Tienes un recibo nuevo de ' || replace(to_char(r.total, 'FM999990.00'), '.', ',') || ' €. En la app ves el detalle y cómo pagarlo.',
    '/hipica/' || r.hipica_id || '/familia');
  return null;
end;
$$;
create constraint trigger aviso_recibo after insert on public.recibos
  deferrable initially deferred
  for each row execute function public.aviso_recibo();

-- Cuidado de un caballo de propietario que toca pronto y nadie ha decidido quién lo hace.
create function public.aviso_cuidado()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  c record;
begin
  if new.hecho or new.responsable is not null or new.fecha > current_date + 14 then
    return null;
  end if;
  select nombre, tipo, propietario_id into c from public.caballos where id = new.caballo_id;
  if c.tipo <> 'propietario' or c.propietario_id is null then
    return null;
  end if;
  perform public._avisar(c.propietario_id, public._nombre_cuidado(new.tipo) || ' para ' || c.nombre,
    'Toca el ' || public._dia(new.fecha) || '. ¿Lo hace la hípica o te encargas tú?',
    '/hipica/' || new.hipica_id || '/caballos/' || new.caballo_id,
    'cuidado:' || new.id);
  return null;
end;
$$;
create trigger aviso_cuidado after insert on public.cuidados
  for each row execute function public.aviso_cuidado();

-- Servicios: al equipo cuando se piden; al propietario cuando se responden.
create function public.aviso_solicitud()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_caballo text;
  v_que     text;
begin
  select nombre into v_caballo from public.caballos where id = new.caballo_id;
  select string_agg(x ->> 'nombre', ', ') into v_que from jsonb_array_elements(new.servicios) x;
  if tg_op = 'INSERT' then
    if new.estado = 'pendiente' then
      perform public._avisar_equipo(new.hipica_id, array['admin', 'cuadra'], 'Servicio pedido · ' || v_caballo,
        coalesce(v_que, 'Servicio') || ' para el ' || public._dia(new.fecha) || '.',
        '/hipica/' || new.hipica_id || '/servicios');
    end if;
  elsif old.estado = 'pendiente' and new.estado in ('aceptada', 'rechazada') and new.miembro_id is not null then
    perform public._avisar(new.miembro_id,
      case new.estado when 'aceptada' then 'Servicio aceptado' else 'Servicio rechazado' end || ' · ' || v_caballo,
      coalesce(v_que, 'Servicio') || ' para el ' || public._dia(new.fecha)
        || case new.estado when 'aceptada' then '. La hípica se encarga.' else '. Habla con la hípica si lo necesitas.' end,
      '/hipica/' || new.hipica_id || '/servicios');
  end if;
  return null;
end;
$$;
create trigger aviso_solicitud after insert or update of estado on public.solicitudes
  for each row execute function public.aviso_solicitud();

-- Alta por revisar: a los administradores.
create function public.aviso_alta()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.estado = 'pendiente' then
    perform public._avisar_equipo(new.hipica_id, array['admin'], 'Alta por revisar',
      new.nombre || ' quiere apuntarse a la hípica.', '/hipica/' || new.hipica_id || '/gestion');
  end if;
  return null;
end;
$$;
create trigger aviso_alta after insert on public.altas
  for each row execute function public.aviso_alta();

-- Tablón: a todos los que tienen cuenta, menos a quien lo escribe.
create function public.aviso_tablon()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.notificaciones (hipica_id, miembro_id, titulo, texto, url)
  select new.hipica_id, m.id, 'Aviso de ' || h.nombre, left(new.texto, 500), '/hipica/' || new.hipica_id
  from public.miembros m
  join public.hipicas h on h.id = new.hipica_id
  where m.hipica_id = new.hipica_id and m.activo and m.user_id is not null
    and m.user_id is distinct from (select auth.uid());
  return null;
end;
$$;
create trigger aviso_tablon after insert on public.avisos
  for each row execute function public.aviso_tablon();

-- ---------------------------------------------------------------------
-- 6. Recordatorios (una vez al día, desde el servidor)
-- ---------------------------------------------------------------------
-- Clases de mañana y cuidados de dentro de 2 días sin decidir.
-- Se puede ejecutar varias veces: cada recordatorio sale una sola vez.
create function public._recordatorios()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  r    record;
  v_n  integer := 0;
begin
  for r in
    select re.id, re.miembro_id, s.titulo, s.inicio, s.hipica_id, h.zona_horaria tz, ca.nombre caballo
    from public.reservas re
    join public.sesiones s on s.id = re.sesion_id
    join public.hipicas h on h.id = s.hipica_id
    left join public.caballos ca on ca.id = re.caballo_id
    where re.estado = 'confirmada' and not s.cancelada and h.recordar_clases
      and (s.inicio at time zone h.zona_horaria)::date = (now() at time zone h.zona_horaria)::date + 1
  loop
    perform public._avisar(r.miembro_id, 'Mañana tienes clase',
      r.titulo || ' a las ' || to_char(r.inicio at time zone r.tz, 'HH24:MI')
        || coalesce(', con ' || r.caballo, '') || '. Si no puedes ir, anúlala en la app.',
      '/hipica/' || r.hipica_id, 'recordatorio:' || r.id);
    v_n := v_n + 1;
  end loop;

  for r in
    select cu.id, cu.tipo, cu.fecha, cu.hipica_id, cu.caballo_id, ca.nombre, ca.propietario_id
    from public.cuidados cu
    join public.caballos ca on ca.id = cu.caballo_id
    where not cu.hecho and cu.responsable is null and ca.tipo = 'propietario'
      and ca.propietario_id is not null and cu.fecha = current_date + 2
  loop
    perform public._avisar(r.propietario_id, public._nombre_cuidado(r.tipo) || ' para ' || r.nombre,
      'Es pasado mañana (' || public._dia(r.fecha) || ') y falta decidir: ¿lo hace la hípica o te encargas tú?',
      '/hipica/' || r.hipica_id || '/caballos/' || r.caballo_id, 'cuidado-2d:' || r.id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

create function public.recordatorios_diarios(p_secreto text)
returns integer
language plpgsql security definer set search_path = ''
as $$
begin
  perform public._comprobar_secreto(p_secreto);
  return public._recordatorios();
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Para el servidor: coger los avisos por enviar (push y email)
-- ---------------------------------------------------------------------
-- Los marca como enviados al cogerlos: si dos envíos coinciden, cada aviso
-- sale una sola vez. La demo no manda nada fuera de la app.
create function public.tomar_avisos(p_secreto text, p_limite integer default 100)
returns table (id uuid, titulo text, texto text, url text, hipica text, email text, suscripciones jsonb)
language plpgsql security definer set search_path = ''
as $$
begin
  perform public._comprobar_secreto(p_secreto);
  return query
  with cogidos as (
    update public.notificaciones n
    set enviada_en = now()
    where n.id in (
      select x.id from public.notificaciones x
      where x.enviada_en is null and x.created_at > now() - interval '2 days'
      order by x.created_at
      limit least(greatest(coalesce(p_limite, 100), 1), 500)
      for update skip locked
    )
    returning n.id, n.titulo, n.texto, n.url, n.hipica_id, n.miembro_id
  )
  select c.id, c.titulo, c.texto, c.url, h.nombre,
    case when m.avisos_email then u.email::text end,
    coalesce((select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
              from public.suscripciones s where s.user_id = m.user_id), '[]'::jsonb)
  from cogidos c
  join public.hipicas h on h.id = c.hipica_id
  join public.miembros m on m.id = c.miembro_id
  join auth.users u on u.id = m.user_id
  where not h.es_demo;
end;
$$;

-- El servicio de push dice que ese móvil ya no existe: se borra.
create function public.quitar_suscripcion_caducada(p_secreto text, p_endpoint text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public._comprobar_secreto(p_secreto);
  delete from public.suscripciones where endpoint = p_endpoint;
end;
$$;

-- ---------------------------------------------------------------------
-- 8. Para cada usuario
-- ---------------------------------------------------------------------
-- Activar las notificaciones en este móvil. Si el móvil era de otra
-- cuenta (sesión cerrada y abierta con otra), pasa a la nueva.
create function public.guardar_suscripcion(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Hay que iniciar sesión';
  end if;
  insert into public.suscripciones (endpoint, user_id, p256dh, auth)
  values (p_endpoint, (select auth.uid()), p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
end;
$$;

create function public.borrar_suscripcion(p_endpoint text)
returns void
language sql security definer set search_path = ''
as $$
  delete from public.suscripciones where endpoint = p_endpoint and user_id = (select auth.uid());
$$;

create function public.marcar_avisos_leidos(p_hipica uuid)
returns void
language sql security definer set search_path = ''
as $$
  update public.notificaciones n set leida_en = now()
  from public.miembros m
  where m.id = n.miembro_id and m.user_id = (select auth.uid())
    and n.hipica_id = p_hipica and n.leida_en is null
$$;

-- Emails sí o no (en todas las hípicas del usuario).
create function public.cambiar_avisos_email(p_activo boolean)
returns void
language sql security definer set search_path = ''
as $$
  update public.miembros set avisos_email = coalesce(p_activo, true) where user_id = (select auth.uid())
$$;

-- ---------------------------------------------------------------------
-- 9. Permisos de las funciones
-- ---------------------------------------------------------------------
revoke execute on function
  public._comprobar_secreto(text), public._dia_semana(date), public._dia(date), public._cuando(timestamptz, text),
  public._nombre_cuidado(text), public._destinatario(uuid), public._avisar(uuid, text, text, text, text),
  public._avisar_equipo(uuid, text[], text, text, text), public.aviso_sesion(), public.aviso_reserva(),
  public.aviso_recibo(), public.aviso_cuidado(), public.aviso_solicitud(), public.aviso_alta(), public.aviso_tablon(),
  public._recordatorios(), public.recordatorios_diarios(text), public.tomar_avisos(text, integer),
  public.quitar_suscripcion_caducada(text, text), public.guardar_suscripcion(text, text, text),
  public.borrar_suscripcion(text), public.marcar_avisos_leidos(uuid), public.cambiar_avisos_email(boolean)
from public, anon, authenticated;

-- El servidor llama sin sesión de usuario: estas tres comprueban el secreto.
grant execute on function
  public.recordatorios_diarios(text), public.tomar_avisos(text, integer), public.quitar_suscripcion_caducada(text, text)
to anon, authenticated;
grant execute on function
  public.guardar_suscripcion(text, text, text), public.borrar_suscripcion(text),
  public.marcar_avisos_leidos(uuid), public.cambiar_avisos_email(boolean)
to authenticated;
