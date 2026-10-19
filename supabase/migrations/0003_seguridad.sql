-- =====================================================================
-- 0003 · Refuerzo de seguridad (resultado de la auditoría)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Qué columnas se pueden modificar.
--    Antes se podía cambiar cualquier columna (incluido el id) si la
--    política lo permitía. Ahora solo las que tienen sentido.
-- ---------------------------------------------------------------------
revoke update on public.hipicas, public.miembros, public.clases,
                 public.sesiones, public.invitaciones from authenticated;

grant update (nombre, zona_horaria, horas_minimas_anulacion) on public.hipicas to authenticated;
grant update (nombre, telefono, rol, activo) on public.miembros to authenticated;
grant update (titulo, nivel, monitor_id, dia_semana, hora_inicio, duracion_min, plazas, activa)
  on public.clases to authenticated;
grant update (titulo, monitor_id, inicio, fin, plazas, cancelada) on public.sesiones to authenticated;
-- invitaciones: no se editan; se crean o se borran.

-- ---------------------------------------------------------------------
-- 2. Datos personales: los alumnos ya no pueden leer las fichas
--    (ni el teléfono) del administrador ni de los monitores. Solo la
--    suya. El nombre del monitor les llega por la función horario().
-- ---------------------------------------------------------------------
drop policy miembros_select on public.miembros;
create policy miembros_select on public.miembros
  for select to authenticated using (
    user_id = (select auth.uid())
    or public.es_staff(hipica_id)
  );

-- ---------------------------------------------------------------------
-- 3. Límites de tamaño en textos que escribe el usuario.
-- ---------------------------------------------------------------------
alter table public.miembros
  add constraint miembros_telefono_largo check (telefono is null or char_length(telefono) <= 30);
alter table public.clases
  add constraint clases_nivel_largo check (nivel is null or char_length(nivel) <= 60);
alter table public.sesiones
  add constraint sesiones_titulo_largo check (char_length(titulo) between 1 and 120);

-- ---------------------------------------------------------------------
-- 4. Zona horaria válida.
-- ---------------------------------------------------------------------
create function public.validar_hipica()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.zona_horaria) then
    raise exception 'Zona horaria no válida: %', new.zona_horaria;
  end if;
  return new;
end;
$$;

create trigger hipicas_validar
before insert or update of zona_horaria on public.hipicas
for each row execute function public.validar_hipica();

-- ---------------------------------------------------------------------
-- 5. Una hípica nunca se queda sin administrador activo.
-- ---------------------------------------------------------------------
create or replace function public.proteger_miembro()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.hipica_id <> old.hipica_id or new.user_id <> old.user_id or new.id <> old.id then
      raise exception 'No se puede cambiar la hípica ni el usuario de un miembro';
    end if;
    if (new.rol <> old.rol or new.activo <> old.activo)
       and (select auth.uid()) is not null
       and not public.es_admin(old.hipica_id) then
      raise exception 'Solo un administrador puede cambiar roles';
    end if;
  end if;

  -- ¿Se va el último administrador activo?
  if old.rol = 'admin' and old.activo
     and (tg_op = 'DELETE' or new.rol <> 'admin' or not new.activo)
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

drop trigger miembros_proteger on public.miembros;
create trigger miembros_proteger
before update or delete on public.miembros
for each row execute function public.proteger_miembro();

-- ---------------------------------------------------------------------
-- 6. Máximo de hípicas por usuario (evita que alguien llene la base de
--    datos creando hípicas sin parar).
-- ---------------------------------------------------------------------
create or replace function public.crear_hipica(p_nombre text, p_nombre_admin text)
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
  if (select count(*) from public.miembros where user_id = v_uid and rol = 'admin') >= 3 then
    raise exception 'Has alcanzado el máximo de hípicas por cuenta';
  end if;
  insert into public.hipicas (nombre) values (p_nombre) returning id into v_hipica;
  insert into public.miembros (hipica_id, user_id, rol, nombre)
  values (v_hipica, v_uid, 'admin', p_nombre_admin);
  return v_hipica;
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Dar de baja a un miembro: deja de ver la hípica y se anulan sus
--    reservas futuras. No puede volver a entrar con un enlace.
-- ---------------------------------------------------------------------
create function public.dar_de_baja(p_miembro uuid)
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

  update public.miembros set activo = false where id = p_miembro;

  update public.reservas r
  set estado = 'anulada', updated_at = now()
  from public.sesiones s
  where r.sesion_id = s.id
    and r.miembro_id = p_miembro
    and r.estado = 'confirmada'
    and s.inicio > now();
end;
$$;

revoke execute on function public.dar_de_baja(uuid) from public, anon;
revoke execute on function public.validar_hipica() from public, anon, authenticated;
revoke execute on function public.proteger_miembro() from public, anon, authenticated;
revoke execute on function public.crear_hipica(text, text) from public, anon;
grant execute on function public.dar_de_baja(uuid) to authenticated;
grant execute on function public.crear_hipica(text, text) to authenticated;
