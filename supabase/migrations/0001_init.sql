-- =====================================================================
-- App de gestión para hípicas · v1 (clases y reservas)
-- Esquema inicial para Supabase (PostgreSQL 15+)
--
-- Principios:
--   * Todas las tablas llevan hipica_id y tienen RLS activado.
--   * Las claves foráneas compuestas (id, hipica_id) impiden mezclar
--     datos de dos hípicas aunque haya un fallo en la aplicación.
--   * Reservar, anular, aceptar invitaciones y crear una hípica se hace
--     SOLO mediante funciones (RPC); las tablas de reservas no admiten
--     escrituras directas desde el cliente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type public.rol_miembro as enum ('admin', 'monitor', 'alumno');
create type public.estado_reserva as enum ('confirmada', 'anulada');

-- ---------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------
create table public.hipicas (
  id                      uuid primary key default gen_random_uuid(),
  nombre                  text not null check (char_length(nombre) between 2 and 120),
  zona_horaria            text not null default 'Europe/Madrid',
  horas_minimas_anulacion integer not null default 12
                          check (horas_minimas_anulacion between 0 and 168),
  created_at              timestamptz not null default now()
);

create table public.miembros (
  id         uuid primary key default gen_random_uuid(),
  hipica_id  uuid not null references public.hipicas (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  rol        public.rol_miembro not null,
  nombre     text not null check (char_length(nombre) between 1 and 120),
  telefono   text,
  activo     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (hipica_id, user_id),
  unique (id, hipica_id)
);
create index miembros_user_idx on public.miembros (user_id);

-- Plantilla semanal: "Iniciación, martes 18:00, 60 min, 6 plazas"
create table public.clases (
  id          uuid primary key default gen_random_uuid(),
  hipica_id   uuid not null references public.hipicas (id) on delete cascade,
  titulo      text not null check (char_length(titulo) between 1 and 120),
  nivel       text,
  monitor_id  uuid,
  dia_semana  smallint not null check (dia_semana between 1 and 7), -- 1 = lunes … 7 = domingo
  hora_inicio time not null,
  duracion_min integer not null default 60 check (duracion_min between 15 and 480),
  plazas      integer not null check (plazas between 1 and 100),
  activa      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (id, hipica_id),
  foreign key (monitor_id, hipica_id)
    references public.miembros (id, hipica_id) on delete set null (monitor_id)
);
create index clases_hipica_idx on public.clases (hipica_id);

-- Cada clase concreta en el calendario (se generan a partir de "clases")
create table public.sesiones (
  id         uuid primary key default gen_random_uuid(),
  hipica_id  uuid not null references public.hipicas (id) on delete cascade,
  clase_id   uuid,
  titulo     text not null,
  monitor_id uuid,
  inicio     timestamptz not null,
  fin        timestamptz not null,
  plazas     integer not null check (plazas between 1 and 100),
  cancelada  boolean not null default false,
  created_at timestamptz not null default now(),
  check (fin > inicio),
  unique (clase_id, inicio),
  unique (id, hipica_id),
  foreign key (clase_id, hipica_id)
    references public.clases (id, hipica_id) on delete set null (clase_id),
  foreign key (monitor_id, hipica_id)
    references public.miembros (id, hipica_id) on delete set null (monitor_id)
);
create index sesiones_hipica_inicio_idx on public.sesiones (hipica_id, inicio);

create table public.reservas (
  id         uuid primary key default gen_random_uuid(),
  hipica_id  uuid not null references public.hipicas (id) on delete cascade,
  sesion_id  uuid not null,
  miembro_id uuid not null,
  estado     public.estado_reserva not null default 'confirmada',
  asistio    boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sesion_id, miembro_id),
  foreign key (sesion_id, hipica_id)
    references public.sesiones (id, hipica_id) on delete cascade,
  foreign key (miembro_id, hipica_id)
    references public.miembros (id, hipica_id) on delete cascade
);
create index reservas_miembro_idx on public.reservas (miembro_id);

-- Enlace de invitación. usos_max null = enlace reutilizable (para alumnos)
create table public.invitaciones (
  id         uuid primary key default gen_random_uuid(),
  hipica_id  uuid not null references public.hipicas (id) on delete cascade,
  rol        public.rol_miembro not null default 'alumno' check (rol <> 'admin'),
  token      text not null unique default replace(gen_random_uuid()::text, '-', ''),
  usos_max   integer check (usos_max is null or usos_max >= 1),
  usos       integer not null default 0,
  expira_en  timestamptz not null default now() + interval '30 days',
  created_at timestamptz not null default now()
);
create index invitaciones_hipica_idx on public.invitaciones (hipica_id);

-- ---------------------------------------------------------------------
-- Funciones de ayuda para las políticas
-- (security definer para leer miembros sin recursión de RLS)
-- ---------------------------------------------------------------------
create function public.mi_rol(p_hipica uuid)
returns public.rol_miembro
language sql stable security definer set search_path = ''
as $$
  select m.rol
  from public.miembros m
  where m.hipica_id = p_hipica
    and m.user_id = (select auth.uid())
    and m.activo
$$;

create function public.es_miembro(p_hipica uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select public.mi_rol(p_hipica) is not null $$;

create function public.es_admin(p_hipica uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce(public.mi_rol(p_hipica) = 'admin', false) $$;

create function public.es_staff(p_hipica uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce(public.mi_rol(p_hipica) in ('admin', 'monitor'), false) $$;

-- ---------------------------------------------------------------------
-- Protección de miembros: nadie cambia de hípica ni de usuario, y solo
-- un admin cambia roles o desactiva a alguien.
-- ---------------------------------------------------------------------
create function public.proteger_miembro()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.hipica_id <> old.hipica_id or new.user_id <> old.user_id then
    raise exception 'No se puede cambiar la hípica ni el usuario de un miembro';
  end if;
  if (new.rol <> old.rol or new.activo <> old.activo)
     and (select auth.uid()) is not null
     and not public.es_admin(old.hipica_id) then
    raise exception 'Solo un administrador puede cambiar roles';
  end if;
  return new;
end;
$$;

create trigger miembros_proteger
before update on public.miembros
for each row execute function public.proteger_miembro();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.hipicas      enable row level security;
alter table public.miembros     enable row level security;
alter table public.clases       enable row level security;
alter table public.sesiones     enable row level security;
alter table public.reservas     enable row level security;
alter table public.invitaciones enable row level security;

-- hipicas: la ven sus miembros; la edita su admin. Se crea con crear_hipica().
create policy hipicas_select on public.hipicas
  for select to authenticated using (public.es_miembro(id));
create policy hipicas_update on public.hipicas
  for update to authenticated
  using (public.es_admin(id)) with check (public.es_admin(id));

-- miembros: cada uno se ve a sí mismo; staff ve a todos los de su hípica;
-- los alumnos ven a admins y monitores (no a otros alumnos).
create policy miembros_select on public.miembros
  for select to authenticated using (
    user_id = (select auth.uid())
    or public.es_staff(hipica_id)
    or (rol in ('admin', 'monitor') and public.es_miembro(hipica_id))
  );
create policy miembros_update on public.miembros
  for update to authenticated
  using (user_id = (select auth.uid()) or public.es_admin(hipica_id))
  with check (user_id = (select auth.uid()) or public.es_admin(hipica_id));
create policy miembros_delete on public.miembros
  for delete to authenticated using (public.es_admin(hipica_id));

-- clases y sesiones: las ven los miembros; las gestiona el admin.
create policy clases_select on public.clases
  for select to authenticated using (public.es_miembro(hipica_id));
create policy clases_write on public.clases
  for all to authenticated
  using (public.es_admin(hipica_id)) with check (public.es_admin(hipica_id));

create policy sesiones_select on public.sesiones
  for select to authenticated using (public.es_miembro(hipica_id));
create policy sesiones_write on public.sesiones
  for all to authenticated
  using (public.es_admin(hipica_id)) with check (public.es_admin(hipica_id));

-- reservas: cada alumno ve las suyas; staff ve todas las de su hípica.
-- Sin políticas de escritura: solo se escriben mediante las funciones.
create policy reservas_select on public.reservas
  for select to authenticated using (
    public.es_staff(hipica_id)
    or exists (
      select 1 from public.miembros m
      where m.id = miembro_id and m.user_id = (select auth.uid())
    )
  );

-- invitaciones: solo el admin.
create policy invitaciones_admin on public.invitaciones
  for all to authenticated
  using (public.es_admin(hipica_id)) with check (public.es_admin(hipica_id));

-- ---------------------------------------------------------------------
-- Funciones (RPC) que llama la aplicación
-- ---------------------------------------------------------------------

-- Crea una hípica y convierte al usuario actual en su administrador.
create function public.crear_hipica(p_nombre text, p_nombre_admin text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_hipica uuid;
begin
  if v_uid is null then
    raise exception 'Hay que iniciar sesión';
  end if;
  insert into public.hipicas (nombre) values (p_nombre) returning id into v_hipica;
  insert into public.miembros (hipica_id, user_id, rol, nombre)
  values (v_hipica, v_uid, 'admin', p_nombre_admin);
  return v_hipica;
end;
$$;

-- Crea las sesiones concretas de las clases activas hasta una fecha.
-- Se puede repetir sin duplicar (on conflict do nothing).
create function public.generar_sesiones(p_hipica uuid, p_hasta date)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_tz text;
  v_creadas integer;
begin
  if not public.es_admin(p_hipica) then
    raise exception 'Solo un administrador puede generar sesiones';
  end if;
  if p_hasta > current_date + 120 then
    raise exception 'Como máximo 120 días por adelantado';
  end if;

  select zona_horaria into v_tz from public.hipicas where id = p_hipica;

  insert into public.sesiones (hipica_id, clase_id, titulo, monitor_id, inicio, fin, plazas)
  select c.hipica_id, c.id, c.titulo, c.monitor_id,
         (d::date + c.hora_inicio) at time zone v_tz,
         (d::date + c.hora_inicio + make_interval(mins => c.duracion_min)) at time zone v_tz,
         c.plazas
  from public.clases c
  cross join generate_series(current_date, p_hasta, interval '1 day') as d
  where c.hipica_id = p_hipica
    and c.activa
    and extract(isodow from d) = c.dia_semana
    and (d::date + c.hora_inicio) at time zone v_tz > now()
  on conflict (clase_id, inicio) do nothing;

  get diagnostics v_creadas = row_count;
  return v_creadas;
end;
$$;

-- Reserva una plaza para el usuario actual. Bloquea la sesión para que
-- dos reservas simultáneas no superen las plazas.
create function public.reservar(p_sesion uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_sesion public.sesiones%rowtype;
  v_miembro uuid;
  v_ocupadas integer;
  v_reserva uuid;
begin
  if v_uid is null then
    raise exception 'Hay que iniciar sesión';
  end if;

  select * into v_sesion from public.sesiones where id = p_sesion for update;
  if not found then
    raise exception 'Clase no encontrada';
  end if;

  select id into v_miembro from public.miembros
  where hipica_id = v_sesion.hipica_id and user_id = v_uid and activo;
  if v_miembro is null then
    raise exception 'No perteneces a esta hípica';
  end if;

  if v_sesion.cancelada then
    raise exception 'La clase está cancelada';
  end if;
  if v_sesion.inicio <= now() then
    raise exception 'La clase ya ha empezado';
  end if;

  if exists (select 1 from public.reservas
             where sesion_id = p_sesion and miembro_id = v_miembro
               and estado = 'confirmada') then
    raise exception 'Ya tienes plaza en esta clase';
  end if;

  select count(*) into v_ocupadas from public.reservas
  where sesion_id = p_sesion and estado = 'confirmada';
  if v_ocupadas >= v_sesion.plazas then
    raise exception 'No quedan plazas';
  end if;

  insert into public.reservas (hipica_id, sesion_id, miembro_id)
  values (v_sesion.hipica_id, p_sesion, v_miembro)
  on conflict (sesion_id, miembro_id) do update
    set estado = 'confirmada', updated_at = now()
    where public.reservas.estado = 'anulada'
  returning id into v_reserva;

  if v_reserva is null then
    raise exception 'Ya tienes plaza en esta clase';
  end if;
  return v_reserva;
end;
$$;

-- Anula una reserva. El alumno solo puede hasta X horas antes;
-- el admin puede siempre.
create function public.anular_reserva(p_reserva uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_hipica uuid;
  v_inicio timestamptz;
  v_horas integer;
  v_duenio uuid;
begin
  select r.hipica_id, s.inicio, h.horas_minimas_anulacion, m.user_id
  into v_hipica, v_inicio, v_horas, v_duenio
  from public.reservas r
  join public.sesiones s on s.id = r.sesion_id
  join public.hipicas h on h.id = r.hipica_id
  join public.miembros m on m.id = r.miembro_id
  where r.id = p_reserva and r.estado = 'confirmada'
  for update of r;

  if not found then
    raise exception 'Reserva no encontrada';
  end if;

  if public.es_admin(v_hipica) then
    null; -- el admin puede anular siempre
  elsif v_duenio = v_uid then
    if now() > v_inicio - make_interval(hours => v_horas) then
      raise exception 'Ya no se puede anular: el plazo era de % horas antes', v_horas;
    end if;
  else
    raise exception 'No puedes anular esta reserva';
  end if;

  update public.reservas
  set estado = 'anulada', updated_at = now()
  where id = p_reserva;
end;
$$;

-- El monitor o el admin marcan si el alumno vino.
create function public.marcar_asistencia(p_reserva uuid, p_asistio boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_hipica uuid;
begin
  select hipica_id into v_hipica from public.reservas where id = p_reserva;
  if v_hipica is null or not public.es_staff(v_hipica) then
    raise exception 'No puedes marcar asistencia en esta clase';
  end if;
  update public.reservas
  set asistio = p_asistio, updated_at = now()
  where id = p_reserva;
end;
$$;

-- Une al usuario actual a la hípica de la invitación.
create function public.aceptar_invitacion(p_token text, p_nombre text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_inv public.invitaciones%rowtype;
begin
  if v_uid is null then
    raise exception 'Hay que iniciar sesión';
  end if;

  select * into v_inv from public.invitaciones where token = p_token for update;
  if not found or v_inv.expira_en < now() then
    raise exception 'Invitación no válida o caducada';
  end if;

  if exists (select 1 from public.miembros
             where hipica_id = v_inv.hipica_id and user_id = v_uid) then
    return v_inv.hipica_id; -- ya era miembro: no gasta un uso
  end if;

  if v_inv.usos_max is not null and v_inv.usos >= v_inv.usos_max then
    raise exception 'Invitación no válida o caducada';
  end if;

  insert into public.miembros (hipica_id, user_id, rol, nombre)
  values (v_inv.hipica_id, v_uid, v_inv.rol, p_nombre);

  update public.invitaciones set usos = usos + 1 where id = v_inv.id;
  return v_inv.hipica_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Permisos: nada para usuarios anónimos; las funciones solo para
-- usuarios con sesión iniciada.
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon;

-- Permisos explícitos para usuarios con sesión (el proyecto tiene
-- desactivado "Automatically expose new tables"). RLS sigue filtrando
-- qué filas ve y toca cada uno.
grant usage on schema public to authenticated;
grant select on public.hipicas, public.miembros, public.clases,
                public.sesiones, public.reservas, public.invitaciones to authenticated;
grant update on public.hipicas to authenticated;
grant update, delete on public.miembros to authenticated;
grant insert, update, delete on public.clases, public.sesiones,
                                public.invitaciones to authenticated;
-- reservas: sin escritura directa; solo mediante las funciones.

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.mi_rol(uuid), public.es_miembro(uuid), public.es_admin(uuid), public.es_staff(uuid),
  public.crear_hipica(text, text), public.generar_sesiones(uuid, date),
  public.reservar(uuid), public.anular_reserva(uuid),
  public.marcar_asistencia(uuid, boolean), public.aceptar_invitacion(text, text)
to authenticated;
