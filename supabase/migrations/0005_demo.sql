-- =====================================================================
-- 0005 · Modo demo
--
-- Una hípica de ejemplo para enseñar la app sin email ni Google.
-- Requisitos (en Supabase → Authentication → Users → Add user, marcando
-- "Auto Confirm User"):
--   demo-admin@example.com     (dueño de la hípica)
--   demo-familia@example.com   (madre con dos hijos)
-- con la misma contraseña, que se pone en Vercel como DEMO_PASSWORD.
--
-- reset_demo() borra y vuelve a crear la hípica de ejemplo. Se ejecuta
-- una vez al instalar y luego cada noche (ver supabase/cron.sql).
-- =====================================================================

alter table public.hipicas add column es_demo boolean not null default false;

create function public.reset_demo()
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_admin uuid;
  v_familia uuid;
  v_h uuid;
  v_dueno uuid;
  v_madre uuid;
  v_lucia uuid;
  v_alumnos uuid[];
  s record;
  i integer := 0;
  n integer;
  v_ponis integer := 0;
begin
  select id into v_admin from auth.users where email = 'demo-admin@example.com';
  select id into v_familia from auth.users where email = 'demo-familia@example.com';
  if v_admin is null or v_familia is null then
    raise exception 'Faltan los usuarios de la demo (demo-admin@example.com y demo-familia@example.com)';
  end if;

  -- Borra la demo anterior y cualquier hípica que hayan creado los usuarios demo.
  delete from public.hipicas
  where es_demo
     or id in (select hipica_id from public.miembros where user_id in (v_admin, v_familia));

  insert into public.hipicas (nombre, es_demo, horas_minimas_anulacion, calendario_auto, semanas_auto)
  values ('Hípica La Dehesa', true, 12, false, 2)
  returning id into v_h;

  insert into public.miembros (hipica_id, user_id, rol, nombre, telefono)
  values (v_h, v_admin, 'admin', 'Carmen Ruiz', '600 000 001')
  returning id into v_dueno;

  insert into public.miembros (hipica_id, user_id, rol, nombre, telefono)
  values (v_h, v_familia, 'alumno', 'Marta López', '600 000 002')
  returning id into v_madre;

  insert into public.miembros (hipica_id, rol, nombre, titular_id)
  values (v_h, 'alumno', 'Lucía López', v_madre)
  returning id into v_lucia;
  insert into public.miembros (hipica_id, rol, nombre, titular_id)
  values (v_h, 'alumno', 'Pablo López', v_madre);

  -- Alumnos sin cuenta para que las clases tengan gente.
  with nuevos as (
    insert into public.miembros (hipica_id, rol, nombre)
    select v_h, 'alumno', nombre
    from unnest(array[
      'Ana Martín', 'Javier Sánchez', 'Elena Gómez', 'Diego Navarro', 'Sara Romero',
      'Hugo Torres', 'Claudia Díaz', 'Mario Vega', 'Irene Castro', 'Álvaro Ortiz'
    ]) as nombre
    returning id
  )
  select array_agg(id) into v_alumnos from nuevos;

  insert into public.clases (hipica_id, titulo, nivel, monitor_id, dia_semana, hora_inicio, duracion_min, plazas)
  values
    (v_h, 'Ponis',              'Niños de 5 a 9 años', v_dueno, 1, '17:30', 45, 6),
    (v_h, 'Iniciación',         'Principiantes',       v_dueno, 1, '19:00', 60, 6),
    (v_h, 'Doma básica',        'Intermedio',          v_dueno, 2, '18:00', 60, 5),
    (v_h, 'Ponis',              'Niños de 5 a 9 años', v_dueno, 3, '17:30', 45, 6),
    (v_h, 'Salto',              'Avanzado',            v_dueno, 4, '19:00', 60, 4),
    (v_h, 'Iniciación',         'Principiantes',       v_dueno, 5, '18:00', 60, 6),
    (v_h, 'Paseo por el campo', 'Todos los niveles',   v_dueno, 6, '10:00', 90, 8),
    (v_h, 'Ponis',              'Niños de 5 a 9 años', v_dueno, 6, '12:00', 45, 6);

  perform public._generar_sesiones(v_h, current_date + 14);

  -- Ocupa las plazas de forma variada (algunas clases llenas, otras vacías)
  -- y apunta a Lucía a las dos primeras clases de ponis.
  for s in select id, titulo, plazas from public.sesiones where hipica_id = v_h order by inicio loop
    i := i + 1;
    n := least(s.plazas - 1, (i * 3) % (s.plazas + 2));
    if s.titulo = 'Ponis' and v_ponis < 2 then
      v_ponis := v_ponis + 1;
      insert into public.reservas (hipica_id, sesion_id, miembro_id) values (v_h, s.id, v_lucia);
      n := least(n, s.plazas - 1);
    elsif i % 5 = 0 then
      n := s.plazas; -- clase completa
    end if;
    if n > 0 then
      insert into public.reservas (hipica_id, sesion_id, miembro_id)
      select v_h, s.id, a from unnest(v_alumnos[1:n]) as a
      on conflict do nothing;
    end if;
  end loop;

  return v_h;
end;
$$;

revoke execute on function public.reset_demo() from public, anon, authenticated;

-- Las cuentas de la demo no se pueden borrar desde la app.
create or replace function public.borrar_mi_cuenta()
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
  if exists (select 1 from auth.users where id = v_uid
             and email in ('demo-admin@example.com', 'demo-familia@example.com')) then
    raise exception 'La cuenta de demostración no se puede borrar';
  end if;

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
    delete from public.hipicas where id = h.hipica_id;
  end loop;

  delete from auth.users where id = v_uid;
end;
$$;

revoke execute on function public.borrar_mi_cuenta() from public, anon;
grant execute on function public.borrar_mi_cuenta() to authenticated;
