-- =====================================================================
-- 0007 · Demo con las novedades de la escuela
--
-- Rehace la hípica de ejemplo con pistas, caballos, niveles, bonos,
-- lista de espera y tablón. Hay clases todos los días para que la
-- pantalla "Hoy" siempre tenga contenido.
-- Después de aplicar esta migración, ejecuta una vez:
--   select public.reset_demo();
-- =====================================================================

create or replace function public.reset_demo()
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
  v_pablo uuid;
  v_p1 uuid;
  v_p2 uuid;
  v_cub uuid;
  v_alumnos uuid[];
  v_caballos uuid[];
  s record;
  r record;
  i integer := 0;
  n integer;
  k integer;
  v_lucia_n integer := 0;
  v_pablo_n integer := 0;
  v_llena uuid;
  v_dejar_sin_caballo boolean := true;
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

  -- Pistas
  insert into public.pistas (hipica_id, nombre, orden) values (v_h, 'Pista 1', 1) returning id into v_p1;
  insert into public.pistas (hipica_id, nombre, orden) values (v_h, 'Pista 2', 2) returning id into v_p2;
  insert into public.pistas (hipica_id, nombre, orden) values (v_h, 'Cubierta', 3) returning id into v_cub;

  -- Personas
  insert into public.miembros (hipica_id, user_id, rol, nombre, telefono)
  values (v_h, v_admin, 'admin', 'Carmen Ruiz', '600 000 001')
  returning id into v_dueno;

  insert into public.miembros (hipica_id, user_id, rol, nombre, telefono)
  values (v_h, v_familia, 'alumno', 'Marta López', '600 000 002')
  returning id into v_madre;

  insert into public.miembros (hipica_id, rol, nombre, titular_id, nivel)
  values (v_h, 'alumno', 'Lucía López', v_madre, 'Galope 1')
  returning id into v_lucia;
  insert into public.miembros (hipica_id, rol, nombre, titular_id, nivel)
  values (v_h, 'alumno', 'Pablo López', v_madre, 'Iniciación')
  returning id into v_pablo;

  with nuevos as (
    insert into public.miembros (hipica_id, rol, nombre, nivel, telefono)
    select v_h, 'alumno', x.nombre, x.nivel, x.tel
    from (values
      (1,  'Ana Martín',     'Galope 2',   '600 100 001'),
      (2,  'Javier Sánchez', 'Galope 4',   '600 100 002'),
      (3,  'Elena Gómez',    'Galope 3',   null),
      (4,  'Diego Navarro',  'Iniciación', '600 100 004'),
      (5,  'Sara Romero',    'Galope 2',   '600 100 005'),
      (6,  'Hugo Torres',    'Iniciación', null),
      (7,  'Claudia Díaz',   'Galope 3',   '600 100 007'),
      (8,  'Mario Vega',     'Galope 1',   '600 100 008'),
      (9,  'Irene Castro',   'Galope 5',   null),
      (10, 'Álvaro Ortiz',   'Galope 4',   '600 100 010'),
      (11, 'Nora Delgado',   'Galope 1',   '600 100 011'),
      (12, 'Bruno Cano',     'Galope 2',   null)
    ) as x(orden, nombre, nivel, tel)
    order by x.orden
    returning id
  )
  select array_agg(id) into v_alumnos from nuevos;

  -- Caballos de escuela (Brisa, en reposo)
  with nuevos as (
    insert into public.caballos (hipica_id, nombre, max_clases_dia)
    select v_h, nombre, 3
    from unnest(array['Nube', 'Bambú', 'Rayo', 'Perla', 'Sol', 'Lirio', 'Canela']) with ordinality as t(nombre, o)
    order by o
    returning id
  )
  select array_agg(id) into v_caballos from nuevos;
  insert into public.caballos (hipica_id, nombre, disponible, notas)
  values (v_h, 'Brisa', false, 'En reposo hasta el lunes por una cojera leve.');

  -- Bonos: la mayoría de 8 clases; alguno de 4; dos sin bono; uno a punto de acabarse.
  insert into public.bonos (hipica_id, miembro_id, clases, caduca)
  values (v_h, v_lucia, 8, current_date + 60), (v_h, v_pablo, 4, current_date + 60);
  insert into public.bonos (hipica_id, miembro_id, clases, caduca)
  select v_h, a, case when o in (4, 10) then 5 else 8 end, current_date + 45
  from unnest(v_alumnos) with ordinality as t(a, o)
  where o not in (2, 9);            -- Javier e Irene, sin bono
  update public.bonos set clases = 2 where miembro_id = v_alumnos[6];   -- Hugo: se le acaba

  -- Horario semanal: clases todos los días.
  insert into public.clases (hipica_id, titulo, nivel, tipo, pista_id, monitor_id, dia_semana, hora_inicio, duracion_min, plazas)
  select v_h, x.titulo, x.nivel, x.tipo,
         case x.pista when 1 then v_p1 when 2 then v_p2 when 3 then v_cub end,
         case when x.tipo = 'libre' then null else v_dueno end,
         x.dia, x.hora::time, x.dur, x.plazas
  from (values
    -- Pista libre por las mañanas (no gasta bono)
    ('Pista libre', null, 'libre', 3, 1, '10:00', 60, 4),
    ('Pista libre', null, 'libre', 3, 2, '10:00', 60, 4),
    ('Pista libre', null, 'libre', 3, 3, '10:00', 60, 4),
    ('Pista libre', null, 'libre', 3, 4, '10:00', 60, 4),
    ('Pista libre', null, 'libre', 3, 5, '10:00', 60, 4),
    ('Pista libre', null, 'libre', 3, 6, '11:00', 60, 4),
    ('Pista libre', null, 'libre', 3, 7, '12:00', 60, 4),
    -- Particular
    ('Clase particular', null, 'particular', 2, 3, '11:00', 45, 1),
    ('Clase particular', null, 'particular', 2, 5, '11:00', 45, 1),
    -- Ponis por la tarde
    ('Ponis', 'Niños de 5 a 9 años', 'grupo', 1, 1, '17:30', 45, 6),
    ('Ponis', 'Niños de 5 a 9 años', 'grupo', 1, 2, '17:30', 45, 6),
    ('Ponis', 'Niños de 5 a 9 años', 'grupo', 1, 3, '17:30', 45, 6),
    ('Ponis', 'Niños de 5 a 9 años', 'grupo', 1, 4, '17:30', 45, 6),
    ('Ponis', 'Niños de 5 a 9 años', 'grupo', 1, 5, '17:30', 45, 6),
    ('Ponis', 'Niños de 5 a 9 años', 'grupo', 1, 6, '12:00', 45, 6),
    -- Grupos
    ('Iniciación',          'Iniciación',        'grupo', 2, 1, '18:30', 60, 6),
    ('Doma básica',         'Galope 1 a 3',      'grupo', 1, 2, '18:30', 60, 5),
    ('Iniciación',          'Iniciación',        'grupo', 2, 3, '18:30', 60, 6),
    ('Salto',               'Galope 4 o más',    'grupo', 1, 4, '18:30', 60, 4),
    ('Adultos nivel medio', 'Galope 2 a 4',      'grupo', 2, 5, '18:30', 60, 6),
    ('Paseo por el campo',  'Todos los niveles', 'grupo', 3, 6, '10:00', 90, 8),
    ('Iniciación',          'Iniciación',        'grupo', 1, 7, '10:30', 60, 6),
    ('Salto',               'Galope 4 o más',    'grupo', 1, 7, '17:00', 60, 4)
  ) as x(titulo, nivel, tipo, pista, dia, hora, dur, plazas);

  perform public._generar_sesiones(v_h, current_date + 14);

  -- Reservas variadas (algunas clases llenas, otras con hueco).
  for s in select id, titulo, tipo, plazas from public.sesiones where hipica_id = v_h order by inicio, titulo loop
    i := i + 1;

    -- Lucía, a sus dos primeras clases de ponis; Pablo, a las tres primeras.
    if s.titulo = 'Ponis' and v_lucia_n < 2 then
      v_lucia_n := v_lucia_n + 1;
      perform public._crear_reserva(s.id, v_lucia, false, true);
    end if;
    if s.titulo = 'Ponis' and v_pablo_n < 3 then
      v_pablo_n := v_pablo_n + 1;
      perform public._crear_reserva(s.id, v_pablo, false, true);
    end if;

    n := case
      when s.tipo = 'particular' then (i % 2)
      when s.tipo = 'libre' then 1 + (i % 3)
      when v_llena is null and s.titulo in ('Iniciación', 'Salto') then s.plazas   -- la primera, completa
      else greatest(1, least(s.plazas - 1, (i * 3) % (s.plazas + 1)))
    end;
    n := n - (select count(*)::integer from public.reservas where sesion_id = s.id);

    k := 0;
    while n > 0 and k < array_length(v_alumnos, 1) loop
      k := k + 1;
      -- Cada alumno, como mucho 5 clases en las dos semanas (como en la vida real).
      continue when (select count(*) from public.reservas
                     where miembro_id = v_alumnos[1 + ((i + k * 5) % array_length(v_alumnos, 1))]
                       and estado = 'confirmada') >= 5;
      begin
        perform public._crear_reserva(s.id, v_alumnos[1 + ((i + k * 5) % array_length(v_alumnos, 1))], false, true);
        n := n - 1;
      exception when others then
        null;   -- ya estaba en la clase
      end;
    end loop;

    if v_llena is null and s.titulo in ('Iniciación', 'Salto')
       and (select count(*) from public.reservas where sesion_id = s.id) >= s.plazas then
      v_llena := s.id;
    end if;
  end loop;

  -- Lista de espera en la primera clase completa: un alumno y Pablo.
  if v_llena is not null then
    insert into public.esperas (hipica_id, sesion_id, miembro_id)
    select v_h, v_llena, a
    from unnest(v_alumnos) as a
    where not exists (select 1 from public.reservas where sesion_id = v_llena and miembro_id = a)
    limit 1;
    insert into public.esperas (hipica_id, sesion_id, miembro_id) values (v_h, v_llena, v_pablo);
  end if;

  -- Caballos para las clases de los próximos dos días (sin repetir en la
  -- misma clase). Se deja un jinete sin caballo para que se vea el aviso.
  for s in
    select id from public.sesiones
    where hipica_id = v_h and tipo <> 'libre' and inicio < now() + interval '2 days'
    order by inicio
  loop
    k := 0;
    for r in
      select id from public.reservas
      where sesion_id = s.id and estado = 'confirmada'
      order by created_at
    loop
      k := k + 1;
      exit when k > array_length(v_caballos, 1);
      if v_dejar_sin_caballo and k = 3 then
        v_dejar_sin_caballo := false;
        continue;
      end if;
      update public.reservas
      set caballo_id = v_caballos[1 + ((k + i) % array_length(v_caballos, 1))]
      where id = r.id;
    end loop;
    i := i + 1;
  end loop;

  -- Tablón
  insert into public.avisos (hipica_id, texto, created_at) values
    (v_h, 'Bienvenidos a la nueva app de reservas. Si tenéis cualquier duda, preguntad en recepción.',
     now() - interval '6 days'),
    (v_h, 'El viernes la pista exterior estará cerrada por mantenimiento del suelo. La cubierta funciona con normalidad.',
     now() - interval '1 day');

  return v_h;
end;
$$;

revoke execute on function public.reset_demo() from public, anon, authenticated;
