-- =====================================================================
-- 0006 · Escuela: pistas, tipos de clase, niveles, caballos de escuela,
--        bonos de clases, lista de espera y tablón de avisos.
--
--   * Pista: dónde se da la clase (Pista 1, Cubierta…).
--   * Tipo de clase: 'grupo' (gasta una clase del bono), 'particular'
--     y 'libre' (pista libre: no gastan bono).
--   * Nivel del jinete: lo ponen el admin o los monitores.
--   * Caballos: de momento solo los de escuela. El monitor asigna uno a
--     cada jinete de la clase; un caballo no puede estar dos veces en la
--     misma clase.
--   * Bonos: "8 clases". Cada reserva de grupo gasta una; si se anula,
--     vuelve. Se cuentan a partir de las reservas, así nunca se descuadran.
--   * Lista de espera: si alguien anula, entra el primero de la lista.
--   * Tablón: avisos del admin que ven todos los miembros.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Pistas y tipo de clase
-- ---------------------------------------------------------------------
create table public.pistas (
  id         uuid primary key default gen_random_uuid(),
  hipica_id  uuid not null references public.hipicas (id) on delete cascade,
  nombre     text not null check (char_length(nombre) between 1 and 60),
  orden      smallint not null default 0,
  activa     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, hipica_id)
);
create index pistas_hipica_idx on public.pistas (hipica_id);

alter table public.clases
  add column pista_id uuid,
  add column tipo text not null default 'grupo' check (tipo in ('grupo', 'particular', 'libre')),
  add constraint clases_pista_fk foreign key (pista_id, hipica_id)
    references public.pistas (id, hipica_id) on delete set null (pista_id);

alter table public.sesiones
  add column pista_id uuid,
  add column tipo text not null default 'grupo' check (tipo in ('grupo', 'particular', 'libre')),
  add constraint sesiones_pista_fk foreign key (pista_id, hipica_id)
    references public.pistas (id, hipica_id) on delete set null (pista_id);

-- ---------------------------------------------------------------------
-- 2. Nivel del jinete (solo lo cambian el admin o los monitores)
-- ---------------------------------------------------------------------
alter table public.miembros
  add column nivel text check (nivel is null or char_length(nivel) <= 40);

create or replace function public.proteger_miembro()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.hipica_id <> old.hipica_id
       or new.user_id is distinct from old.user_id
       or new.titular_id is distinct from old.titular_id
       or new.id <> old.id then
      raise exception 'No se puede cambiar la hípica ni el usuario de un miembro';
    end if;
    if (new.rol <> old.rol or new.activo <> old.activo)
       and (select auth.uid()) is not null
       and not public.es_admin(old.hipica_id) then
      raise exception 'Solo un administrador puede cambiar roles';
    end if;
    if new.nivel is distinct from old.nivel
       and (select auth.uid()) is not null
       and not public.es_staff(old.hipica_id) then
      raise exception 'Solo la hípica puede cambiar el nivel';
    end if;
  end if;

  if old.rol = 'admin' and old.activo
     and (tg_op = 'DELETE' or new.rol <> 'admin' or not new.activo)
     and exists (select 1 from public.hipicas h where h.id = old.hipica_id)
     and not exists (
       select 1 from public.miembros m
       where m.hipica_id = old.hipica_id and m.id <> old.id
         and m.rol = 'admin' and m.activo
     ) then
    raise exception 'La hípica debe tener al menos un administrador';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- Los monitores también pueden actualizar el nivel de los alumnos de su hípica.
drop policy miembros_update on public.miembros;
create policy miembros_update on public.miembros
  for update to authenticated
  using (user_id = (select auth.uid()) or public.es_mi_ficha(titular_id) or public.es_staff(hipica_id))
  with check (user_id = (select auth.uid()) or public.es_mi_ficha(titular_id) or public.es_staff(hipica_id));

-- Un monitor solo puede tocar el nivel; el resto de columnas, el admin o el propio miembro.
create function public.limitar_monitor()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and not public.es_admin(old.hipica_id)
     and old.user_id is distinct from (select auth.uid())
     and not public.es_mi_ficha(old.titular_id)
     and (new.nombre is distinct from old.nombre or new.telefono is distinct from old.telefono) then
    raise exception 'Solo el administrador puede cambiar estos datos';
  end if;
  return new;
end;
$$;

create trigger miembros_limitar_monitor
before update on public.miembros
for each row execute function public.limitar_monitor();

-- ---------------------------------------------------------------------
-- 3. Caballos de escuela
-- ---------------------------------------------------------------------
create table public.caballos (
  id             uuid primary key default gen_random_uuid(),
  hipica_id      uuid not null references public.hipicas (id) on delete cascade,
  nombre         text not null check (char_length(nombre) between 1 and 60),
  tipo           text not null default 'escuela' check (tipo in ('escuela', 'propietario')),
  disponible     boolean not null default true,   -- false = en reposo, no sale en clases
  max_clases_dia smallint not null default 3 check (max_clases_dia between 1 and 10),
  notas          text check (notas is null or char_length(notas) <= 300),
  activo         boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (id, hipica_id)
);
create index caballos_hipica_idx on public.caballos (hipica_id);

-- ---------------------------------------------------------------------
-- 4. Bonos de clases
-- ---------------------------------------------------------------------
create table public.bonos (
  id         uuid primary key default gen_random_uuid(),
  hipica_id  uuid not null references public.hipicas (id) on delete cascade,
  miembro_id uuid not null,
  clases     smallint not null check (clases between 1 and 100),
  caduca     date,
  nota       text check (nota is null or char_length(nota) <= 120),
  created_at timestamptz not null default now(),
  unique (id, hipica_id),
  foreign key (miembro_id, hipica_id)
    references public.miembros (id, hipica_id) on delete cascade
);
create index bonos_miembro_idx on public.bonos (miembro_id);

alter table public.hipicas add column exigir_bono boolean not null default false;

-- ---------------------------------------------------------------------
-- 5. Reservas: caballo asignado, bono usado y si entró desde la espera
-- ---------------------------------------------------------------------
alter table public.reservas
  add column caballo_id uuid,
  add column bono_id uuid,
  add column desde_espera boolean not null default false,
  add constraint reservas_caballo_fk foreign key (caballo_id, hipica_id)
    references public.caballos (id, hipica_id) on delete set null (caballo_id),
  add constraint reservas_bono_fk foreign key (bono_id, hipica_id)
    references public.bonos (id, hipica_id) on delete set null (bono_id);

create unique index reservas_caballo_unico on public.reservas (sesion_id, caballo_id)
  where estado = 'confirmada' and caballo_id is not null;
create index reservas_bono_idx on public.reservas (bono_id) where bono_id is not null;
create index reservas_caballo_idx on public.reservas (caballo_id) where caballo_id is not null;

-- ---------------------------------------------------------------------
-- 6. Lista de espera
-- ---------------------------------------------------------------------
create table public.esperas (
  id         uuid primary key default gen_random_uuid(),
  hipica_id  uuid not null references public.hipicas (id) on delete cascade,
  sesion_id  uuid not null,
  miembro_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (sesion_id, miembro_id),
  foreign key (sesion_id, hipica_id)
    references public.sesiones (id, hipica_id) on delete cascade,
  foreign key (miembro_id, hipica_id)
    references public.miembros (id, hipica_id) on delete cascade
);
create index esperas_sesion_idx on public.esperas (sesion_id, created_at);
create index esperas_miembro_idx on public.esperas (miembro_id);

-- ---------------------------------------------------------------------
-- 7. Tablón de avisos
-- ---------------------------------------------------------------------
create table public.avisos (
  id         uuid primary key default gen_random_uuid(),
  hipica_id  uuid not null references public.hipicas (id) on delete cascade,
  texto      text not null check (char_length(texto) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index avisos_hipica_idx on public.avisos (hipica_id, created_at desc);

-- ---------------------------------------------------------------------
-- 8. RLS de las tablas nuevas
-- ---------------------------------------------------------------------
alter table public.pistas   enable row level security;
alter table public.caballos enable row level security;
alter table public.bonos    enable row level security;
alter table public.esperas  enable row level security;
alter table public.avisos   enable row level security;

create policy pistas_select on public.pistas
  for select to authenticated using (public.es_miembro(hipica_id));
create policy pistas_write on public.pistas
  for all to authenticated
  using (public.es_admin(hipica_id)) with check (public.es_admin(hipica_id));

-- Los alumnos solo ven el nombre del caballo que les toca (por horario()).
create policy caballos_select on public.caballos
  for select to authenticated using (public.es_staff(hipica_id));
create policy caballos_write on public.caballos
  for all to authenticated
  using (public.es_admin(hipica_id)) with check (public.es_admin(hipica_id));

create policy bonos_select on public.bonos
  for select to authenticated using (public.es_staff(hipica_id) or public.puedo_gestionar(miembro_id));
create policy bonos_write on public.bonos
  for all to authenticated
  using (public.es_admin(hipica_id)) with check (public.es_admin(hipica_id));

-- Esperas: sin escritura directa (solo mediante funciones).
create policy esperas_select on public.esperas
  for select to authenticated using (public.es_staff(hipica_id) or public.puedo_gestionar(miembro_id));

create policy avisos_select on public.avisos
  for select to authenticated using (public.es_miembro(hipica_id));
create policy avisos_insert on public.avisos
  for insert to authenticated with check (public.es_admin(hipica_id));
create policy avisos_delete on public.avisos
  for delete to authenticated using (public.es_admin(hipica_id));

-- ---------------------------------------------------------------------
-- 9. Calendario: las sesiones copian pista y tipo de su clase
-- ---------------------------------------------------------------------
create or replace function public._generar_sesiones(p_hipica uuid, p_hasta date)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_tz text;
  v_creadas integer;
begin
  select zona_horaria into v_tz from public.hipicas where id = p_hipica;

  insert into public.sesiones (hipica_id, clase_id, titulo, monitor_id, inicio, fin, plazas, pista_id, tipo)
  select c.hipica_id, c.id, c.titulo, c.monitor_id,
         (d::date + c.hora_inicio) at time zone v_tz,
         (d::date + c.hora_inicio + make_interval(mins => c.duracion_min)) at time zone v_tz,
         c.plazas, c.pista_id, c.tipo
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

-- ---------------------------------------------------------------------
-- 10. Bonos: cuál se usa y cuántas clases quedan
-- ---------------------------------------------------------------------

-- Clases gastadas de un bono (reservas confirmadas que lo usan, sin contar
-- las clases que la hípica ha cancelado).
create function public._bono_usadas(p_bono uuid)
returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::integer
  from public.reservas r
  join public.sesiones s on s.id = r.sesion_id
  where r.bono_id = p_bono and r.estado = 'confirmada' and not s.cancelada
$$;

-- El bono que toca usar para una clase de ese día: el que caduca antes y
-- aún tiene clases.
create function public._bono_disponible(p_miembro uuid, p_fecha date)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select b.id
  from public.bonos b
  where b.miembro_id = p_miembro
    and (b.caduca is null or b.caduca >= p_fecha)
    and public._bono_usadas(b.id) < b.clases
  order by b.caduca nulls last, b.created_at
  limit 1
$$;

-- ---------------------------------------------------------------------
-- 11. Reservar (lógica común). Asume la sesión ya bloqueada (for update).
-- ---------------------------------------------------------------------
create function public._crear_reserva(
  p_sesion uuid, p_miembro uuid, p_desde_espera boolean, p_sin_bono_ok boolean
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_sesion public.sesiones%rowtype;
  v_tz text;
  v_exigir boolean;
  v_bono uuid;
  v_reserva uuid;
begin
  select * into v_sesion from public.sesiones where id = p_sesion;
  select zona_horaria, exigir_bono into v_tz, v_exigir from public.hipicas where id = v_sesion.hipica_id;

  -- Una reserva a la vez por jinete (para no gastar dos veces la última clase del bono).
  perform 1 from public.miembros
  where id = p_miembro and hipica_id = v_sesion.hipica_id and activo
  for update;
  if not found then
    raise exception 'No perteneces a esta hípica';
  end if;

  if v_sesion.cancelada then
    raise exception 'La clase está cancelada';
  end if;
  if v_sesion.inicio <= now() then
    raise exception 'La clase ya ha empezado';
  end if;
  if exists (select 1 from public.reservas
             where sesion_id = p_sesion and miembro_id = p_miembro and estado = 'confirmada') then
    raise exception 'Ya tienes plaza en esta clase';
  end if;
  if (select count(*) from public.reservas where sesion_id = p_sesion and estado = 'confirmada')
     >= v_sesion.plazas then
    raise exception 'No quedan plazas';
  end if;

  if v_sesion.tipo = 'grupo' then
    v_bono := public._bono_disponible(p_miembro, (v_sesion.inicio at time zone v_tz)::date);
    if v_bono is null and v_exigir and not p_sin_bono_ok then
      raise exception 'No te quedan clases en el bono';
    end if;
  end if;

  insert into public.reservas (hipica_id, sesion_id, miembro_id, bono_id, desde_espera)
  values (v_sesion.hipica_id, p_sesion, p_miembro, v_bono, p_desde_espera)
  on conflict (sesion_id, miembro_id) do update
    set estado = 'confirmada', updated_at = now(), asistio = null, caballo_id = null,
        bono_id = excluded.bono_id, desde_espera = excluded.desde_espera
    where public.reservas.estado = 'anulada'
  returning id into v_reserva;

  delete from public.esperas where sesion_id = p_sesion and miembro_id = p_miembro;
  return v_reserva;
end;
$$;

-- Si hay sitio, mete en la clase a los primeros de la lista de espera.
-- Quien no pueda entrar (p. ej. sin clases en el bono) sigue esperando.
create function public._promover_espera(p_sesion uuid)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_sesion public.sesiones%rowtype;
  e record;
  v_entran integer := 0;
begin
  select * into v_sesion from public.sesiones where id = p_sesion for update;
  if not found or v_sesion.cancelada or v_sesion.inicio <= now() then
    return 0;
  end if;

  for e in select miembro_id from public.esperas where sesion_id = p_sesion order by created_at loop
    exit when (select count(*) from public.reservas
               where sesion_id = p_sesion and estado = 'confirmada') >= v_sesion.plazas;
    begin
      perform public._crear_reserva(p_sesion, e.miembro_id, true, false);
      v_entran := v_entran + 1;
    exception when others then
      null;
    end;
  end loop;
  return v_entran;
end;
$$;

-- ¿Para quién reserva? Para uno mismo (p_miembro null), para un jinete a su
-- cargo, o (admin) para cualquier alumno.
create function public._resolver_miembro(p_hipica uuid, p_miembro uuid)
returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_miembro uuid := p_miembro;
begin
  if (select auth.uid()) is null then
    raise exception 'Hay que iniciar sesión';
  end if;
  if v_miembro is null then
    select id into v_miembro from public.miembros
    where hipica_id = p_hipica and user_id = (select auth.uid()) and activo;
    if v_miembro is null then
      raise exception 'No perteneces a esta hípica';
    end if;
  else
    if not exists (select 1 from public.miembros
                   where id = v_miembro and hipica_id = p_hipica and activo) then
      raise exception 'No perteneces a esta hípica';
    end if;
    if not (public.puedo_gestionar(v_miembro) or public.es_admin(p_hipica)) then
      raise exception 'No puedes reservar para esta persona';
    end if;
  end if;
  return v_miembro;
end;
$$;

create or replace function public.reservar(p_sesion uuid, p_miembro uuid default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_hipica uuid;
  v_miembro uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Hay que iniciar sesión';
  end if;
  select hipica_id into v_hipica from public.sesiones where id = p_sesion for update;
  if not found then
    raise exception 'Clase no encontrada';
  end if;
  v_miembro := public._resolver_miembro(v_hipica, p_miembro);
  -- El admin puede apuntar a alguien aunque no tenga bono (lo cobra aparte).
  return public._crear_reserva(p_sesion, v_miembro, false, public.es_admin(v_hipica));
end;
$$;

create or replace function public.anular_reserva(p_reserva uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_sesion uuid;
  v_hipica uuid;
  v_inicio timestamptz;
  v_horas integer;
  v_miembro uuid;
begin
  -- Primero la sesión (mismo orden de bloqueo que reservar).
  select sesion_id into v_sesion from public.reservas where id = p_reserva;
  if not found then
    raise exception 'Reserva no encontrada';
  end if;
  perform 1 from public.sesiones where id = v_sesion for update;

  select r.hipica_id, s.inicio, h.horas_minimas_anulacion, r.miembro_id
  into v_hipica, v_inicio, v_horas, v_miembro
  from public.reservas r
  join public.sesiones s on s.id = r.sesion_id
  join public.hipicas h on h.id = r.hipica_id
  where r.id = p_reserva and r.estado = 'confirmada'
  for update of r;

  if not found then
    raise exception 'Reserva no encontrada';
  end if;

  if public.es_admin(v_hipica) then
    null; -- el admin puede anular siempre
  elsif public.puedo_gestionar(v_miembro) then
    if now() > v_inicio - make_interval(hours => v_horas) then
      raise exception 'Ya no se puede anular: el plazo era de % horas antes', v_horas;
    end if;
  else
    raise exception 'No puedes anular esta reserva';
  end if;

  update public.reservas
  set estado = 'anulada', caballo_id = null, updated_at = now()
  where id = p_reserva;

  perform public._promover_espera(v_sesion);
end;
$$;

-- ---------------------------------------------------------------------
-- 12. Lista de espera
-- ---------------------------------------------------------------------
create function public.apuntarse_espera(p_sesion uuid, p_miembro uuid default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_sesion public.sesiones%rowtype;
  v_miembro uuid;
  v_tz text;
  v_exigir boolean;
  v_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Hay que iniciar sesión';
  end if;
  select * into v_sesion from public.sesiones where id = p_sesion for update;
  if not found then
    raise exception 'Clase no encontrada';
  end if;
  v_miembro := public._resolver_miembro(v_sesion.hipica_id, p_miembro);

  if v_sesion.cancelada then
    raise exception 'La clase está cancelada';
  end if;
  if v_sesion.inicio <= now() then
    raise exception 'La clase ya ha empezado';
  end if;
  if exists (select 1 from public.reservas
             where sesion_id = p_sesion and miembro_id = v_miembro and estado = 'confirmada') then
    raise exception 'Ya tienes plaza en esta clase';
  end if;
  if (select count(*) from public.reservas where sesion_id = p_sesion and estado = 'confirmada')
     < v_sesion.plazas then
    raise exception 'Aún quedan plazas: reserva directamente';
  end if;
  if (select count(*) from public.esperas where sesion_id = p_sesion) >= 30 then
    raise exception 'La lista de espera está llena';
  end if;

  select zona_horaria, exigir_bono into v_tz, v_exigir from public.hipicas where id = v_sesion.hipica_id;
  if v_sesion.tipo = 'grupo' and v_exigir and not public.es_admin(v_sesion.hipica_id)
     and public._bono_disponible(v_miembro, (v_sesion.inicio at time zone v_tz)::date) is null then
    raise exception 'No te quedan clases en el bono';
  end if;

  insert into public.esperas (hipica_id, sesion_id, miembro_id)
  values (v_sesion.hipica_id, p_sesion, v_miembro)
  on conflict (sesion_id, miembro_id) do nothing
  returning id into v_id;

  if v_id is null then
    raise exception 'Ya estás en la lista de espera';
  end if;
  return v_id;
end;
$$;

create function public.salir_espera(p_espera uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_hipica uuid;
  v_miembro uuid;
begin
  select hipica_id, miembro_id into v_hipica, v_miembro from public.esperas where id = p_espera;
  if v_hipica is null or not (public.puedo_gestionar(v_miembro) or public.es_admin(v_hipica)) then
    raise exception 'No puedes quitar a esta persona de la lista';
  end if;
  delete from public.esperas where id = p_espera;
end;
$$;

-- Baja: además de anular reservas, quita de las listas de espera y deja
-- entrar a quien esperaba en esas clases.
create or replace function public._baja(p_miembro uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_sesiones uuid[];
  v_sesion uuid;
begin
  update public.miembros set activo = false
  where id = p_miembro or titular_id = p_miembro;

  delete from public.esperas e
  using public.miembros m
  where m.id = e.miembro_id and (m.id = p_miembro or m.titular_id = p_miembro);

  with anuladas as (
    update public.reservas r
    set estado = 'anulada', caballo_id = null, updated_at = now()
    from public.sesiones s, public.miembros m
    where r.sesion_id = s.id
      and m.id = r.miembro_id
      and (m.id = p_miembro or m.titular_id = p_miembro)
      and r.estado = 'confirmada'
      and s.inicio > now()
    returning r.sesion_id
  )
  select array_agg(distinct sesion_id) into v_sesiones from anuladas;

  foreach v_sesion in array coalesce(v_sesiones, '{}') loop
    perform public._promover_espera(v_sesion);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 13. Asignar caballo (admin o monitor)
-- ---------------------------------------------------------------------
create function public.asignar_caballo(p_reserva uuid, p_caballo uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_hipica uuid;
  v_sesion uuid;
begin
  select hipica_id, sesion_id into v_hipica, v_sesion
  from public.reservas where id = p_reserva and estado = 'confirmada';
  if v_hipica is null or not public.es_staff(v_hipica) then
    raise exception 'No puedes asignar caballos en esta clase';
  end if;
  if p_caballo is not null and not exists (
       select 1 from public.caballos where id = p_caballo and hipica_id = v_hipica and activo) then
    raise exception 'Caballo no encontrado';
  end if;
  if p_caballo is not null and exists (
       select 1 from public.reservas
       where sesion_id = v_sesion and caballo_id = p_caballo and estado = 'confirmada' and id <> p_reserva) then
    raise exception 'Ese caballo ya está en esta clase';
  end if;
  update public.reservas set caballo_id = p_caballo, updated_at = now() where id = p_reserva;
end;
$$;

-- ---------------------------------------------------------------------
-- 14. Horario: pista, tipo, lista de espera y caballo de cada reserva mía
-- ---------------------------------------------------------------------
drop function public.horario(uuid, timestamptz, timestamptz);
create function public.horario(p_hipica uuid, p_desde timestamptz, p_hasta timestamptz)
returns table (
  id uuid,
  titulo text,
  nivel text,
  tipo text,
  pista text,
  inicio timestamptz,
  fin timestamptz,
  plazas integer,
  ocupadas integer,
  en_espera integer,
  cancelada boolean,
  monitor text,
  mias jsonb,
  esperas jsonb
)
language sql stable security definer set search_path = ''
as $$
  select
    s.id, s.titulo, c.nivel, s.tipo, p.nombre, s.inicio, s.fin, s.plazas,
    (select count(*)::integer from public.reservas r
      where r.sesion_id = s.id and r.estado = 'confirmada'),
    (select count(*)::integer from public.esperas e where e.sesion_id = s.id),
    s.cancelada,
    m.nombre,
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'reserva', r.id, 'miembro', j.id, 'nombre', j.nombre,
               'caballo', cb.nombre, 'desde_espera', r.desde_espera) order by j.nombre)
      from public.reservas r
      join public.miembros j on j.id = r.miembro_id
      left join public.caballos cb on cb.id = r.caballo_id
      where r.sesion_id = s.id and r.estado = 'confirmada'
        and (j.user_id = (select auth.uid()) or public.es_mi_ficha(j.titular_id))
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'espera', x.id, 'miembro', x.miembro_id, 'nombre', x.nombre, 'puesto', x.puesto) order by x.nombre)
      from (
        select e.id, e.miembro_id, j.nombre, j.user_id, j.titular_id,
               row_number() over (order by e.created_at) as puesto
        from public.esperas e
        join public.miembros j on j.id = e.miembro_id
        where e.sesion_id = s.id
      ) x
      where x.user_id = (select auth.uid()) or public.es_mi_ficha(x.titular_id)
    ), '[]'::jsonb)
  from public.sesiones s
  left join public.clases c on c.id = s.clase_id
  left join public.miembros m on m.id = s.monitor_id
  left join public.pistas p on p.id = s.pista_id
  where s.hipica_id = p_hipica
    and public.es_miembro(p_hipica)
    and p_hasta > p_desde
    and p_hasta - p_desde <= interval '62 days'
    and s.inicio >= p_desde
    and s.inicio < p_hasta
  order by s.inicio, p.orden, s.titulo
$$;

-- ---------------------------------------------------------------------
-- 15. Estado de los bonos: el staff ve a todos los alumnos; cada familia,
--     a los suyos. Muestra el bono en uso (o el último, si está agotado).
-- ---------------------------------------------------------------------
create function public.estado_bonos(p_hipica uuid)
returns table (
  miembro_id uuid,
  nombre text,
  nivel text,
  titular_id uuid,
  con_cuenta boolean,
  bono_id uuid,
  clases integer,
  usadas integer,
  caduca date
)
language sql stable security definer set search_path = ''
as $$
  select m.id, m.nombre, m.nivel, m.titular_id, m.user_id is not null,
         b.id, b.clases, b.usadas, b.caduca
  from public.miembros m
  left join lateral (
    select b.id, b.clases::integer, public._bono_usadas(b.id) as usadas, b.caduca
    from public.bonos b
    where b.miembro_id = m.id
    order by (public._bono_usadas(b.id) < b.clases and (b.caduca is null or b.caduca >= current_date)) desc,
             b.caduca nulls last, b.created_at desc
    limit 1
  ) b on true
  where m.hipica_id = p_hipica
    and m.activo
    and m.rol = 'alumno'
    and (public.es_staff(p_hipica) or public.puedo_gestionar(m.id))
  order by m.nombre
$$;

-- ---------------------------------------------------------------------
-- 16. Permisos
-- ---------------------------------------------------------------------
grant select, insert, delete on public.pistas, public.caballos, public.bonos to authenticated;
grant update (nombre, orden, activa) on public.pistas to authenticated;
grant update (nombre, tipo, disponible, max_clases_dia, notas, activo) on public.caballos to authenticated;
grant update (clases, caduca, nota) on public.bonos to authenticated;
grant select on public.esperas to authenticated;
grant select, insert, delete on public.avisos to authenticated;

grant update (nivel) on public.miembros to authenticated;
grant update (exigir_bono) on public.hipicas to authenticated;
grant update (pista_id, tipo) on public.clases to authenticated;
grant update (pista_id) on public.sesiones to authenticated;

revoke execute on function
  public._bono_usadas(uuid), public._bono_disponible(uuid, date),
  public._crear_reserva(uuid, uuid, boolean, boolean), public._promover_espera(uuid),
  public._resolver_miembro(uuid, uuid), public.limitar_monitor(),
  public.apuntarse_espera(uuid, uuid), public.salir_espera(uuid),
  public.asignar_caballo(uuid, uuid), public.horario(uuid, timestamptz, timestamptz),
  public.estado_bonos(uuid)
from public, anon;

revoke execute on function
  public._bono_usadas(uuid), public._bono_disponible(uuid, date),
  public._crear_reserva(uuid, uuid, boolean, boolean), public._promover_espera(uuid),
  public._resolver_miembro(uuid, uuid), public.limitar_monitor()
from authenticated;

grant execute on function
  public.apuntarse_espera(uuid, uuid), public.salir_espera(uuid),
  public.asignar_caballo(uuid, uuid), public.horario(uuid, timestamptz, timestamptz),
  public.estado_bonos(uuid)
to authenticated;
