-- =====================================================================
-- 0004 · Familias (una cuenta, varios jinetes), alumnos sin cuenta,
--        ajustes de la hípica, calendario automático y borrar cuenta.
--
-- Modelo:
--   * Un miembro con user_id es una persona con cuenta (admin, monitor,
--     alumno o el padre/madre que gestiona a sus hijos).
--   * Un miembro con titular_id es un jinete a cargo de otro miembro
--     (un hijo). No tiene cuenta propia; reserva su titular.
--   * Un miembro sin user_id ni titular_id es un alumno sin cuenta que
--     gestiona el administrador (p. ej. alguien que reserva por teléfono).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Miembros sin cuenta y jinetes a cargo
-- ---------------------------------------------------------------------
alter table public.miembros alter column user_id drop not null;
alter table public.miembros add column titular_id uuid;
alter table public.miembros
  add constraint miembros_titular_fk foreign key (titular_id, hipica_id)
    references public.miembros (id, hipica_id) on delete cascade,
  add constraint miembros_titular_alumno check (titular_id is null or rol = 'alumno'),
  add constraint miembros_titular_sin_cuenta check (titular_id is null or user_id is null),
  add constraint miembros_sin_cuenta_alumno check (user_id is not null or rol = 'alumno');
create index miembros_titular_idx on public.miembros (titular_id);

-- ¿El miembro p_titular es mío (mi propia ficha activa)?
create function public.es_mi_ficha(p_miembro uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.miembros
    where id = p_miembro and user_id = (select auth.uid()) and activo
  )
$$;

-- ¿Puedo reservar/anular en nombre de este miembro? (yo mismo o un jinete a mi cargo)
create function public.puedo_gestionar(p_miembro uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.miembros m
    where m.id = p_miembro and m.activo
      and (m.user_id = (select auth.uid()) or public.es_mi_ficha(m.titular_id))
  )
$$;

drop policy miembros_select on public.miembros;
create policy miembros_select on public.miembros
  for select to authenticated using (
    user_id = (select auth.uid())
    or public.es_mi_ficha(titular_id)
    or public.es_staff(hipica_id)
  );

drop policy miembros_update on public.miembros;
create policy miembros_update on public.miembros
  for update to authenticated
  using (user_id = (select auth.uid()) or public.es_mi_ficha(titular_id) or public.es_admin(hipica_id))
  with check (user_id = (select auth.uid()) or public.es_mi_ficha(titular_id) or public.es_admin(hipica_id));

-- El trigger protege también titular_id, y no exige admin cuando el cambio
-- lo hace el sistema (cascada al borrar una hípica).
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
  end if;

  -- ¿Se va el último administrador activo? (salvo que se esté borrando la hípica entera)
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

-- Baja interna: desactiva al miembro (y a sus jinetes) y anula sus reservas futuras.
create function public._baja(p_miembro uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.miembros set activo = false
  where id = p_miembro or titular_id = p_miembro;

  update public.reservas r
  set estado = 'anulada', updated_at = now()
  from public.sesiones s, public.miembros m
  where r.sesion_id = s.id
    and m.id = r.miembro_id
    and (m.id = p_miembro or m.titular_id = p_miembro)
    and r.estado = 'confirmada'
    and s.inicio > now();
end;
$$;

create or replace function public.dar_de_baja(p_miembro uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_hipica uuid;
  v_user uuid;
begin
  select hipica_id, user_id into v_hipica, v_user from public.miembros where id = p_miembro;
  if v_hipica is null or not public.es_admin(v_hipica) then
    raise exception 'Solo el administrador puede dar de baja a un miembro';
  end if;
  if v_user = (select auth.uid()) then
    raise exception 'No puedes darte de baja a ti mismo';
  end if;
  perform public._baja(p_miembro);
end;
$$;

-- El titular añade un jinete a su cargo (máximo 6).
create function public.anadir_jinete(p_hipica uuid, p_nombre text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_yo uuid;
  v_nuevo uuid;
begin
  select id into v_yo from public.miembros
  where hipica_id = p_hipica and user_id = (select auth.uid()) and activo;
  if v_yo is null then
    raise exception 'No perteneces a esta hípica';
  end if;
  if (select count(*) from public.miembros where titular_id = v_yo and activo) >= 6 then
    raise exception 'Máximo 6 jinetes por cuenta';
  end if;
  insert into public.miembros (hipica_id, rol, nombre, titular_id)
  values (p_hipica, 'alumno', trim(p_nombre), v_yo)
  returning id into v_nuevo;
  return v_nuevo;
end;
$$;

-- El titular (o el admin) quita a un jinete a cargo.
create function public.quitar_jinete(p_miembro uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_titular uuid;
  v_hipica uuid;
begin
  select titular_id, hipica_id into v_titular, v_hipica from public.miembros where id = p_miembro;
  if v_titular is null or not (public.es_mi_ficha(v_titular) or public.es_admin(v_hipica)) then
    raise exception 'No puedes quitar a este jinete';
  end if;
  perform public._baja(p_miembro);
end;
$$;

-- El admin da de alta a un alumno sin cuenta (reserva por teléfono, etc.).
create function public.anadir_alumno_sin_cuenta(p_hipica uuid, p_nombre text, p_telefono text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_nuevo uuid;
begin
  if not public.es_admin(p_hipica) then
    raise exception 'Solo el administrador puede añadir alumnos';
  end if;
  insert into public.miembros (hipica_id, rol, nombre, telefono)
  values (p_hipica, 'alumno', trim(p_nombre), nullif(trim(p_telefono), ''))
  returning id into v_nuevo;
  return v_nuevo;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Reservar y anular para uno mismo, para un jinete a cargo,
--    o (el admin) para cualquier alumno de la hípica.
-- ---------------------------------------------------------------------
drop function public.reservar(uuid);
create function public.reservar(p_sesion uuid, p_miembro uuid default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_sesion public.sesiones%rowtype;
  v_miembro uuid := p_miembro;
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

  if v_miembro is null then
    select id into v_miembro from public.miembros
    where hipica_id = v_sesion.hipica_id and user_id = v_uid and activo;
    if v_miembro is null then
      raise exception 'No perteneces a esta hípica';
    end if;
  else
    if not exists (select 1 from public.miembros
                   where id = v_miembro and hipica_id = v_sesion.hipica_id and activo) then
      raise exception 'No perteneces a esta hípica';
    end if;
    if not (public.puedo_gestionar(v_miembro) or public.es_admin(v_sesion.hipica_id)) then
      raise exception 'No puedes reservar para esta persona';
    end if;
  end if;

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

  select count(*) into v_ocupadas from public.reservas
  where sesion_id = p_sesion and estado = 'confirmada';
  if v_ocupadas >= v_sesion.plazas then
    raise exception 'No quedan plazas';
  end if;

  insert into public.reservas (hipica_id, sesion_id, miembro_id)
  values (v_sesion.hipica_id, p_sesion, v_miembro)
  on conflict (sesion_id, miembro_id) do update
    set estado = 'confirmada', updated_at = now(), asistio = null
    where public.reservas.estado = 'anulada'
  returning id into v_reserva;

  return v_reserva;
end;
$$;

create or replace function public.anular_reserva(p_reserva uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_hipica uuid;
  v_inicio timestamptz;
  v_horas integer;
  v_miembro uuid;
begin
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

  update public.reservas set estado = 'anulada', updated_at = now() where id = p_reserva;
end;
$$;

-- Los alumnos ven también las reservas de sus jinetes a cargo.
drop policy reservas_select on public.reservas;
create policy reservas_select on public.reservas
  for select to authenticated using (
    public.es_staff(hipica_id) or public.puedo_gestionar(miembro_id)
  );

-- ---------------------------------------------------------------------
-- 3. Horario: ahora devuelve todas las reservas "mías" (yo y mis jinetes)
-- ---------------------------------------------------------------------
drop function public.horario(uuid, timestamptz, timestamptz);
create function public.horario(p_hipica uuid, p_desde timestamptz, p_hasta timestamptz)
returns table (
  id uuid,
  titulo text,
  nivel text,
  inicio timestamptz,
  fin timestamptz,
  plazas integer,
  ocupadas integer,
  cancelada boolean,
  monitor text,
  mias jsonb
)
language sql stable security definer set search_path = ''
as $$
  select
    s.id, s.titulo, c.nivel, s.inicio, s.fin, s.plazas,
    (select count(*)::integer from public.reservas r
      where r.sesion_id = s.id and r.estado = 'confirmada'),
    s.cancelada,
    m.nombre,
    coalesce((
      select jsonb_agg(jsonb_build_object('reserva', r.id, 'miembro', j.id, 'nombre', j.nombre) order by j.nombre)
      from public.reservas r
      join public.miembros j on j.id = r.miembro_id
      where r.sesion_id = s.id and r.estado = 'confirmada'
        and (j.user_id = (select auth.uid()) or public.es_mi_ficha(j.titular_id))
    ), '[]'::jsonb)
  from public.sesiones s
  left join public.clases c on c.id = s.clase_id
  left join public.miembros m on m.id = s.monitor_id
  where s.hipica_id = p_hipica
    and public.es_miembro(p_hipica)
    and p_hasta > p_desde
    and p_hasta - p_desde <= interval '62 days'
    and s.inicio >= p_desde
    and s.inicio < p_hasta
  order by s.inicio
$$;

-- ---------------------------------------------------------------------
-- 4. Ajustes de la hípica y calendario automático
-- ---------------------------------------------------------------------
alter table public.hipicas
  add column calendario_auto boolean not null default true,
  add column semanas_auto integer not null default 4 check (semanas_auto between 1 and 8);
grant update (calendario_auto, semanas_auto) on public.hipicas to authenticated;

-- Versión interna, sin comprobar permisos (la usan generar_sesiones y el automático).
create function public._generar_sesiones(p_hipica uuid, p_hasta date)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_tz text;
  v_creadas integer;
begin
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

create or replace function public.generar_sesiones(p_hipica uuid, p_hasta date)
returns integer
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.es_admin(p_hipica) then
    raise exception 'Solo un administrador puede generar sesiones';
  end if;
  if p_hasta > current_date + 120 then
    raise exception 'Como máximo 120 días por adelantado';
  end if;
  return public._generar_sesiones(p_hipica, p_hasta);
end;
$$;

-- Lo ejecuta una tarea programada (pg_cron) una vez al día.
create function public.generar_calendario_automatico()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  h record;
  v_total integer := 0;
begin
  for h in select id, semanas_auto from public.hipicas where calendario_auto loop
    v_total := v_total + public._generar_sesiones(h.id, current_date + h.semanas_auto * 7);
  end loop;
  return v_total;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Borrar mi cuenta (derecho de supresión, RGPD)
-- ---------------------------------------------------------------------
create function public.borrar_mi_cuenta()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  h record;
begin
  if v_uid is null then
    raise exception 'Hay que iniciar sesión';
  end if;

  -- Hípicas donde soy el único administrador activo.
  for h in
    select m.hipica_id, hp.nombre
    from public.miembros m
    join public.hipicas hp on hp.id = m.hipica_id
    where m.user_id = v_uid and m.rol = 'admin' and m.activo
      and not exists (select 1 from public.miembros o
                      where o.hipica_id = m.hipica_id and o.id <> m.id and o.rol = 'admin' and o.activo)
  loop
    if exists (select 1 from public.miembros o
               where o.hipica_id = h.hipica_id and o.user_id is distinct from v_uid and o.activo
                 and o.titular_id is null) then
      raise exception 'Eres el único administrador de "%". Nombra otro administrador antes de borrar tu cuenta.', h.nombre;
    end if;
    -- Hípica sin nadie más: se borra entera.
    delete from public.hipicas where id = h.hipica_id;
  end loop;

  -- Borra la cuenta: en cascada se borran sus fichas, sus jinetes y sus reservas.
  delete from auth.users where id = v_uid;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Permisos de las funciones nuevas
-- ---------------------------------------------------------------------
revoke execute on function
  public.es_mi_ficha(uuid), public.puedo_gestionar(uuid), public._baja(uuid),
  public.dar_de_baja(uuid), public.anadir_jinete(uuid, text), public.quitar_jinete(uuid),
  public.anadir_alumno_sin_cuenta(uuid, text, text), public.reservar(uuid, uuid),
  public.anular_reserva(uuid), public.horario(uuid, timestamptz, timestamptz),
  public._generar_sesiones(uuid, date), public.generar_sesiones(uuid, date),
  public.generar_calendario_automatico(), public.borrar_mi_cuenta()
from public, anon;

grant execute on function
  public.es_mi_ficha(uuid), public.puedo_gestionar(uuid),
  public.dar_de_baja(uuid), public.anadir_jinete(uuid, text), public.quitar_jinete(uuid),
  public.anadir_alumno_sin_cuenta(uuid, text, text), public.reservar(uuid, uuid),
  public.anular_reserva(uuid), public.horario(uuid, timestamptz, timestamptz),
  public.generar_sesiones(uuid, date), public.borrar_mi_cuenta()
to authenticated;
-- _baja, _generar_sesiones y generar_calendario_automatico NO son accesibles desde la app.
revoke execute on function public._baja(uuid), public._generar_sesiones(uuid, date),
  public.generar_calendario_automatico() from authenticated;
