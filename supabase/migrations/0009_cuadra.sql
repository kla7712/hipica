-- =====================================================================
-- 0009 · Cuadra, almacén, equipo y altas desde la app
--
--   * Rol "cuadra" (mozos de cuadra): ven la cuadra y los caballos, pero
--     no las clases, los alumnos ni sus teléfonos.
--   * Tareas de cuadra por turno (fijas o de un solo día).
--   * Almacén: pienso, heno, paja… con mínimos y aviso para pedir.
--   * Profesionales externos (veterinario, herrador…) con su teléfono.
--   * Altas desde la app: con el enlace de alumnos, la familia rellena
--     quién monta, su nivel y si trae caballo. Si la hípica lo pide, el
--     admin revisa el alta antes de aceptarla.
--   * Número de boxes de la hípica (para ver cuáles están libres).
--
-- Nota: el valor 'cuadra' del rol se compara como texto en este archivo
-- porque un valor nuevo de un enum no se puede usar en la misma
-- transacción en la que se crea.
-- =====================================================================

alter type public.rol_miembro add value if not exists 'cuadra';

-- ¿Soy del equipo? (admin, monitor o cuadra)
create function public.es_equipo(p_hipica uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce(public.mi_rol(p_hipica)::text in ('admin', 'monitor', 'cuadra'), false) $$;

-- Las personas de cuadra tienen cuenta (como los monitores).
alter table public.miembros drop constraint miembros_sin_cuenta_alumno;
alter table public.miembros
  add constraint miembros_sin_cuenta_alumno check (user_id is not null or rol::text = 'alumno');

-- El equipo completo ve a sus compañeros (para saber quién es quién).
drop policy miembros_select on public.miembros;
create policy miembros_select on public.miembros
  for select to authenticated using (
    user_id = (select auth.uid())
    or public.es_mi_ficha(titular_id)
    or public.es_staff(hipica_id)
    or (rol::text <> 'alumno' and public.es_equipo(hipica_id))
  );

-- ---------------------------------------------------------------------
-- 1. Caballos, cuidados y servicios: también para la gente de cuadra
-- ---------------------------------------------------------------------
drop policy caballos_select on public.caballos;
create policy caballos_select on public.caballos
  for select to authenticated using (
    public.es_equipo(hipica_id) or (activo and propietario_id is not null and public.puedo_gestionar(propietario_id))
  );

drop policy cuidados_select on public.cuidados;
drop policy cuidados_write on public.cuidados;
create policy cuidados_select on public.cuidados
  for select to authenticated using (public.es_equipo(hipica_id) or public.es_mi_caballo(caballo_id));
create policy cuidados_write on public.cuidados
  for all to authenticated
  using (public.es_equipo(hipica_id)) with check (public.es_equipo(hipica_id));

drop policy solicitudes_select on public.solicitudes;
create policy solicitudes_select on public.solicitudes
  for select to authenticated using (public.es_equipo(hipica_id) or public.es_mi_caballo(caballo_id));

create or replace function public.mover_caballo(p_caballo uuid, p_ubicacion text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_hipica uuid;
begin
  select hipica_id into v_hipica from public.caballos where id = p_caballo and activo;
  if v_hipica is null or not public.es_equipo(v_hipica) then
    raise exception 'No puedes mover este caballo';
  end if;
  if p_ubicacion not in ('box', 'paddock', 'pista', 'fuera') then
    raise exception 'Ubicación no válida';
  end if;
  update public.caballos
  set ubicacion = p_ubicacion, ubicacion_desde = now()
  where id = p_caballo and ubicacion is distinct from p_ubicacion;
end;
$$;

create or replace function public.cuidado_hecho(p_cuidado uuid, p_nota text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  c public.cuidados%rowtype;
  v_dias integer;
  v_siguiente uuid;
begin
  select * into c from public.cuidados where id = p_cuidado and not hecho for update;
  if not found or not public.es_equipo(c.hipica_id) then
    raise exception 'No puedes marcar este cuidado';
  end if;
  if p_nota is not null and char_length(p_nota) > 300 then
    raise exception 'Nota demasiado larga';
  end if;

  update public.cuidados
  set hecho = true, hecho_en = current_date, nota = coalesce(nullif(trim(p_nota), ''), nota)
  where id = p_cuidado;

  v_dias := case c.tipo
    when 'herrador' then 42
    when 'desparasitacion' then 90
    when 'vacuna' then 365
    when 'dentista' then 365
    else null
  end;
  if v_dias is not null
     and not exists (select 1 from public.cuidados
                     where caballo_id = c.caballo_id and tipo = c.tipo and not hecho) then
    insert into public.cuidados (hipica_id, caballo_id, tipo, fecha)
    values (c.hipica_id, c.caballo_id, c.tipo, current_date + v_dias)
    returning id into v_siguiente;
  end if;
  return v_siguiente;
end;
$$;

-- Aceptar o rechazar: admin o monitor. Marcar como hecha: también cuadra.
create or replace function public.responder_solicitud(p_solicitud uuid, p_estado text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  s public.solicitudes%rowtype;
begin
  select * into s from public.solicitudes where id = p_solicitud for update;
  if not found then
    raise exception 'Solicitud no encontrada';
  end if;
  if p_estado = 'retirada' then
    if s.estado <> 'pendiente' or not (public.es_mi_caballo(s.caballo_id) or public.es_staff(s.hipica_id)) then
      raise exception 'No puedes retirar esta solicitud';
    end if;
    delete from public.solicitudes where id = p_solicitud;
    return;
  end if;
  if p_estado not in ('aceptada', 'rechazada', 'hecha', 'pendiente') then
    raise exception 'Estado no válido';
  end if;
  if not (public.es_staff(s.hipica_id) or (p_estado = 'hecha' and s.estado = 'aceptada' and public.es_equipo(s.hipica_id))) then
    raise exception 'Solo la hípica responde a las solicitudes';
  end if;
  update public.solicitudes set estado = p_estado where id = p_solicitud;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Tareas de cuadra
-- ---------------------------------------------------------------------
create table public.tareas (
  id             uuid primary key default gen_random_uuid(),
  hipica_id      uuid not null references public.hipicas (id) on delete cascade,
  titulo         text not null check (char_length(titulo) between 1 and 80),
  detalle        text check (detalle is null or char_length(detalle) <= 160),
  turno          text not null default 'manana' check (turno in ('manana', 'tarde')),
  hora           time,
  dias           smallint[] not null default '{1,2,3,4,5,6,7}'
                 check (dias <@ '{1,2,3,4,5,6,7}'::smallint[] and cardinality(dias) between 1 and 7),
  fecha          date,                    -- con fecha: solo ese día
  responsable_id uuid,
  activa         boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (id, hipica_id),
  foreign key (responsable_id, hipica_id)
    references public.miembros (id, hipica_id) on delete set null (responsable_id)
);
create index tareas_hipica_idx on public.tareas (hipica_id);

create table public.tareas_hechas (
  tarea_id  uuid not null,
  hipica_id uuid not null references public.hipicas (id) on delete cascade,
  fecha     date not null,
  hecha_por uuid,
  hecha_en  timestamptz not null default now(),
  primary key (tarea_id, fecha),
  foreign key (tarea_id, hipica_id) references public.tareas (id, hipica_id) on delete cascade,
  foreign key (hecha_por, hipica_id) references public.miembros (id, hipica_id) on delete set null (hecha_por)
);

alter table public.tareas        enable row level security;
alter table public.tareas_hechas enable row level security;

create policy tareas_select on public.tareas
  for select to authenticated using (public.es_equipo(hipica_id));
create policy tareas_write on public.tareas
  for all to authenticated
  using (public.es_equipo(hipica_id)) with check (public.es_equipo(hipica_id));
create policy tareas_hechas_select on public.tareas_hechas
  for select to authenticated using (public.es_equipo(hipica_id));

grant select, insert, delete on public.tareas to authenticated;
grant update (titulo, detalle, turno, hora, dias, fecha, responsable_id, activa) on public.tareas to authenticated;
grant select on public.tareas_hechas to authenticated;

-- Marca o desmarca una tarea de un día (hoy, o como mucho una semana atrás).
create function public.marcar_tarea(p_tarea uuid, p_fecha date, p_hecha boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_hipica uuid;
  v_yo uuid;
begin
  select hipica_id into v_hipica from public.tareas where id = p_tarea;
  if v_hipica is null or not public.es_equipo(v_hipica) then
    raise exception 'No puedes marcar esta tarea';
  end if;
  if p_fecha is null or p_fecha > current_date + 1 or p_fecha < current_date - 7 then
    raise exception 'Fecha no válida';
  end if;
  if p_hecha then
    select id into v_yo from public.miembros
    where hipica_id = v_hipica and user_id = (select auth.uid()) and activo;
    insert into public.tareas_hechas (tarea_id, hipica_id, fecha, hecha_por)
    values (p_tarea, v_hipica, p_fecha, v_yo)
    on conflict (tarea_id, fecha) do nothing;
  else
    delete from public.tareas_hechas where tarea_id = p_tarea and fecha = p_fecha;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Almacén
-- ---------------------------------------------------------------------
create table public.existencias (
  id            uuid primary key default gen_random_uuid(),
  hipica_id     uuid not null references public.hipicas (id) on delete cascade,
  nombre        text not null check (char_length(nombre) between 1 and 40),
  unidad        text not null default 'sacos' check (char_length(unidad) between 1 and 20),
  cantidad      numeric(8, 1) not null default 0 check (cantidad between 0 and 100000),
  minimo        numeric(8, 1) not null default 0 check (minimo between 0 and 100000),
  consumo_dia   numeric(6, 2) check (consumo_dia is null or consumo_dia > 0),
  proveedor     text check (proveedor is null or char_length(proveedor) <= 60),
  proveedor_tel text check (proveedor_tel is null or char_length(proveedor_tel) <= 30),
  pedido_en     timestamptz,
  orden         smallint not null default 0,
  created_at    timestamptz not null default now()
);
create index existencias_hipica_idx on public.existencias (hipica_id);

alter table public.existencias enable row level security;
create policy existencias_select on public.existencias
  for select to authenticated using (public.es_equipo(hipica_id));
create policy existencias_write on public.existencias
  for all to authenticated
  using (public.es_admin(hipica_id)) with check (public.es_admin(hipica_id));

grant select, insert, delete on public.existencias to authenticated;
grant update (nombre, unidad, cantidad, minimo, consumo_dia, proveedor, proveedor_tel, orden) on public.existencias to authenticated;

-- Suma o resta (el equipo, al gastar o al llegar un pedido). Al volver a
-- estar por encima del mínimo, el pedido se da por recibido.
create function public.ajustar_existencia(p_existencia uuid, p_cambio numeric)
returns numeric
language plpgsql security definer set search_path = ''
as $$
declare
  v_hipica uuid;
  v_nueva numeric;
begin
  select hipica_id into v_hipica from public.existencias where id = p_existencia for update;
  if v_hipica is null or not public.es_equipo(v_hipica) then
    raise exception 'No puedes cambiar el almacén';
  end if;
  if p_cambio is null or abs(p_cambio) > 1000 then
    raise exception 'Cantidad no válida';
  end if;
  update public.existencias
  set cantidad = least(100000, greatest(0, cantidad + p_cambio)),
      pedido_en = case when cantidad + p_cambio >= minimo and p_cambio > 0 then null else pedido_en end
  where id = p_existencia
  returning cantidad into v_nueva;
  return v_nueva;
end;
$$;

create function public.marcar_pedido(p_existencia uuid, p_pedido boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_hipica uuid;
begin
  select hipica_id into v_hipica from public.existencias where id = p_existencia;
  if v_hipica is null or not public.es_equipo(v_hipica) then
    raise exception 'No puedes cambiar el almacén';
  end if;
  update public.existencias set pedido_en = case when p_pedido then now() end where id = p_existencia;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Profesionales externos (sin acceso a la app)
-- ---------------------------------------------------------------------
create table public.profesionales (
  id         uuid primary key default gen_random_uuid(),
  hipica_id  uuid not null references public.hipicas (id) on delete cascade,
  nombre     text not null check (char_length(nombre) between 1 and 80),
  oficio     text not null check (oficio in ('veterinario', 'herrador', 'fisioterapeuta', 'dentista', 'transporte', 'otro')),
  telefono   text check (telefono is null or char_length(telefono) <= 30),
  nota       text check (nota is null or char_length(nota) <= 120),
  created_at timestamptz not null default now()
);
create index profesionales_hipica_idx on public.profesionales (hipica_id);

alter table public.profesionales enable row level security;
create policy profesionales_select on public.profesionales
  for select to authenticated using (public.es_equipo(hipica_id));
create policy profesionales_write on public.profesionales
  for all to authenticated
  using (public.es_admin(hipica_id)) with check (public.es_admin(hipica_id));

grant select, insert, delete on public.profesionales to authenticated;
grant update (nombre, oficio, telefono, nota) on public.profesionales to authenticated;

-- ---------------------------------------------------------------------
-- 5. Ajustes: boxes y revisión de altas
-- ---------------------------------------------------------------------
alter table public.hipicas
  add column num_boxes smallint not null default 0 check (num_boxes between 0 and 300),
  add column revisar_altas boolean not null default false;
grant update (num_boxes, revisar_altas) on public.hipicas to authenticated;

-- ---------------------------------------------------------------------
-- 6. Altas desde la app
-- ---------------------------------------------------------------------
create table public.altas (
  id            uuid primary key default gen_random_uuid(),
  hipica_id     uuid not null references public.hipicas (id) on delete cascade,
  user_id       uuid references auth.users (id) on delete cascade,
  nombre        text not null check (char_length(nombre) between 1 and 120),
  telefono      text check (telefono is null or char_length(telefono) <= 30),
  jinetes       jsonb not null default '[]',     -- [{nombre, yo, nivel, edad}]
  caballo       jsonb,                           -- {nombre, raza, nacimiento, pupilaje, entrada}
  nota          text check (nota is null or char_length(nota) <= 300),
  estado        text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada')),
  created_at    timestamptz not null default now(),
  revisada_en   timestamptz
);
create index altas_hipica_idx on public.altas (hipica_id, estado);
create index altas_user_idx on public.altas (user_id);

alter table public.altas enable row level security;
create policy altas_select on public.altas
  for select to authenticated using (public.es_admin(hipica_id) or user_id = (select auth.uid()));
grant select on public.altas to authenticated;

-- Crea las fichas de un alta: el titular, sus jinetes y su caballo.
create function public._aprobar_alta(p_alta uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  a public.altas%rowtype;
  j jsonb;
  v_titular uuid;
  v_nivel text;
begin
  select * into a from public.altas where id = p_alta and estado = 'pendiente' for update;
  if not found then
    raise exception 'Alta no encontrada';
  end if;

  if a.user_id is not null
     and exists (select 1 from public.miembros where hipica_id = a.hipica_id and user_id = a.user_id) then
    raise exception 'Esta persona ya está en la hípica';
  end if;

  -- El nivel del titular, si monta él.
  select x ->> 'nivel' into v_nivel from jsonb_array_elements(a.jinetes) x where (x ->> 'yo')::boolean limit 1;

  insert into public.miembros (hipica_id, user_id, rol, nombre, telefono, nivel)
  values (a.hipica_id, a.user_id, 'alumno', a.nombre, a.telefono, v_nivel)
  returning id into v_titular;

  for j in select x from jsonb_array_elements(a.jinetes) x where not coalesce((x ->> 'yo')::boolean, false) loop
    insert into public.miembros (hipica_id, rol, nombre, titular_id, nivel)
    values (a.hipica_id, 'alumno', j ->> 'nombre', v_titular, j ->> 'nivel');
  end loop;

  if a.caballo is not null then
    insert into public.caballos (hipica_id, nombre, tipo, propietario_id, raza, nacimiento, pupilaje, notas, max_clases_dia)
    values (a.hipica_id, a.caballo ->> 'nombre', 'propietario', v_titular, a.caballo ->> 'raza',
            (a.caballo ->> 'nacimiento')::smallint, a.caballo ->> 'pupilaje',
            case when a.caballo ? 'entrada' then 'Entrada prevista el ' || to_char((a.caballo ->> 'entrada')::date, 'DD/MM/YYYY') end,
            2);
  end if;

  update public.altas set estado = 'aprobada', revisada_en = now() where id = p_alta;
  return v_titular;
end;
$$;

-- La familia se da de alta con el enlace de alumnos de la hípica.
create function public.solicitar_alta(
  p_token text, p_nombre text, p_telefono text, p_jinetes jsonb, p_caballo jsonb default null, p_nota text default null
)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_inv public.invitaciones%rowtype;
  v_revisar boolean;
  v_jinetes jsonb := '[]'::jsonb;
  v_caballo jsonb;
  j jsonb;
  v_alta uuid;
  v_yo integer := 0;
begin
  if v_uid is null then
    raise exception 'Hay que iniciar sesión';
  end if;

  select * into v_inv from public.invitaciones where token = p_token for update;
  if not found or v_inv.expira_en < now() or v_inv.rol::text <> 'alumno'
     or (v_inv.usos_max is not null and v_inv.usos >= v_inv.usos_max) then
    raise exception 'Invitación no válida o caducada';
  end if;

  if exists (select 1 from public.miembros where hipica_id = v_inv.hipica_id and user_id = v_uid and activo) then
    return 'miembro';
  end if;
  if exists (select 1 from public.miembros where hipica_id = v_inv.hipica_id and user_id = v_uid) then
    raise exception 'Invitación no válida o caducada';   -- dado de baja
  end if;
  if exists (select 1 from public.altas where hipica_id = v_inv.hipica_id and user_id = v_uid and estado = 'pendiente') then
    raise exception 'Ya tienes una solicitud pendiente';
  end if;
  if (select count(*) from public.altas where hipica_id = v_inv.hipica_id and estado = 'pendiente') >= 100 then
    raise exception 'La hípica tiene demasiadas altas pendientes';
  end if;

  -- Datos de la persona
  p_nombre := trim(coalesce(p_nombre, ''));
  p_telefono := nullif(trim(coalesce(p_telefono, '')), '');
  if char_length(p_nombre) not between 1 and 120 or char_length(coalesce(p_telefono, '')) > 30
     or char_length(coalesce(p_nota, '')) > 300 then
    raise exception 'Revisa tus datos';
  end if;

  -- Jinetes: solo se guardan los campos conocidos y con su tamaño.
  if jsonb_typeof(coalesce(p_jinetes, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_jinetes, '[]'::jsonb)) > 7 then
    raise exception 'Revisa los jinetes';
  end if;
  for j in select x from jsonb_array_elements(coalesce(p_jinetes, '[]'::jsonb)) x loop
    if jsonb_typeof(j) <> 'object'
       or char_length(coalesce(trim(j ->> 'nombre'), '')) not between 1 and 120
       or char_length(coalesce(j ->> 'nivel', '')) > 40
       or (j ? 'edad' and jsonb_typeof(j -> 'edad') <> 'null'
           and (jsonb_typeof(j -> 'edad') <> 'number' or (j ->> 'edad')::numeric not between 2 and 99)) then
      raise exception 'Revisa los jinetes';
    end if;
    if coalesce((j ->> 'yo')::boolean, false) then
      v_yo := v_yo + 1;
    end if;
    v_jinetes := v_jinetes || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'nombre', trim(j ->> 'nombre'),
      'yo', coalesce((j ->> 'yo')::boolean, false),
      'nivel', nullif(trim(j ->> 'nivel'), ''),
      'edad', case when jsonb_typeof(j -> 'edad') = 'number' then (j ->> 'edad')::integer end
    )));
  end loop;
  if v_yo > 1 or jsonb_array_length(v_jinetes) - v_yo > 6 then
    raise exception 'Revisa los jinetes';
  end if;

  -- Caballo (si lo trae)
  if p_caballo is not null and jsonb_typeof(p_caballo) = 'object' then
    if char_length(coalesce(trim(p_caballo ->> 'nombre'), '')) not between 1 and 60
       or char_length(coalesce(p_caballo ->> 'raza', '')) > 60
       or coalesce(p_caballo ->> 'pupilaje', 'completo') not in ('completo', 'semi', 'box')
       or (p_caballo ? 'nacimiento' and (p_caballo ->> 'nacimiento') !~ '^\d{4}$')
       or (p_caballo ? 'entrada' and (p_caballo ->> 'entrada') !~ '^\d{4}-\d{2}-\d{2}$') then
      raise exception 'Revisa los datos del caballo';
    end if;
    v_caballo := jsonb_strip_nulls(jsonb_build_object(
      'nombre', trim(p_caballo ->> 'nombre'),
      'raza', nullif(trim(p_caballo ->> 'raza'), ''),
      'nacimiento', case when (p_caballo ->> 'nacimiento') ~ '^\d{4}$'
                          and (p_caballo ->> 'nacimiento')::integer between 1980 and 2100
                         then (p_caballo ->> 'nacimiento')::integer end,
      'pupilaje', coalesce(p_caballo ->> 'pupilaje', 'completo'),
      'entrada', p_caballo ->> 'entrada'
    ));
  end if;

  if jsonb_array_length(v_jinetes) = 0 and v_caballo is null then
    raise exception 'Dinos quién va a montar o qué caballo traes';
  end if;

  insert into public.altas (hipica_id, user_id, nombre, telefono, jinetes, caballo, nota)
  values (v_inv.hipica_id, v_uid, p_nombre, p_telefono, v_jinetes, v_caballo, nullif(trim(p_nota), ''))
  returning id into v_alta;
  update public.invitaciones set usos = usos + 1 where id = v_inv.id;

  select revisar_altas into v_revisar from public.hipicas where id = v_inv.hipica_id;
  if v_revisar then
    return 'pendiente';
  end if;
  perform public._aprobar_alta(v_alta);
  return 'aprobada';
end;
$$;

-- El admin aprueba o rechaza un alta.
create function public.revisar_alta(p_alta uuid, p_aprobar boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_hipica uuid;
begin
  select hipica_id into v_hipica from public.altas where id = p_alta and estado = 'pendiente';
  if v_hipica is null or not public.es_admin(v_hipica) then
    raise exception 'No puedes revisar esta alta';
  end if;
  if p_aprobar then
    perform public._aprobar_alta(p_alta);
  else
    update public.altas set estado = 'rechazada', revisada_en = now() where id = p_alta;
  end if;
end;
$$;

-- Si la hípica revisa las altas, el enlace de alumnos ya no hace miembro
-- a nadie directamente: hay que rellenar el alta.
create or replace function public.aceptar_invitacion(p_token text, p_nombre text)
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
  if v_inv.rol::text = 'alumno' and (select revisar_altas from public.hipicas where id = v_inv.hipica_id) then
    raise exception 'Esta hípica revisa las altas: rellena el formulario de alta';
  end if;

  insert into public.miembros (hipica_id, user_id, rol, nombre)
  values (v_inv.hipica_id, v_uid, v_inv.rol, p_nombre);

  update public.invitaciones set usos = usos + 1 where id = v_inv.id;
  return v_inv.hipica_id;
end;
$$;

-- La vista previa de la invitación dice también si la hípica revisa las altas.
drop function public.ver_invitacion(text);
create function public.ver_invitacion(p_token text)
returns table (hipica_nombre text, rol public.rol_miembro, revisar_altas boolean)
language sql stable security definer set search_path = ''
as $$
  select h.nombre, i.rol, h.revisar_altas
  from public.invitaciones i
  join public.hipicas h on h.id = i.hipica_id
  where i.token = p_token
    and i.expira_en > now()
    and (i.usos_max is null or i.usos < i.usos_max)
$$;
revoke execute on function public.ver_invitacion(text) from public, anon;
grant execute on function public.ver_invitacion(text) to authenticated;

-- ---------------------------------------------------------------------
-- 7. Permisos de las funciones
-- ---------------------------------------------------------------------
revoke execute on function
  public.es_equipo(uuid), public.marcar_tarea(uuid, date, boolean),
  public.ajustar_existencia(uuid, numeric), public.marcar_pedido(uuid, boolean),
  public._aprobar_alta(uuid), public.solicitar_alta(text, text, text, jsonb, jsonb, text),
  public.revisar_alta(uuid, boolean)
from public, anon;
grant execute on function
  public.es_equipo(uuid), public.marcar_tarea(uuid, date, boolean),
  public.ajustar_existencia(uuid, numeric), public.marcar_pedido(uuid, boolean),
  public.solicitar_alta(text, text, text, jsonb, jsonb, text), public.revisar_alta(uuid, boolean)
to authenticated;
revoke execute on function public._aprobar_alta(uuid) from authenticated;

-- ---------------------------------------------------------------------
-- 8. Demo: tareas, almacén, profesionales, boxes y un alta por revisar
-- ---------------------------------------------------------------------
alter function public.reset_demo() rename to _reset_demo_propietarios;
revoke execute on function public._reset_demo_propietarios() from public, anon, authenticated;

create function public.reset_demo()
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_h uuid;
  v_dueno uuid;
  v_t uuid;
begin
  v_h := public._reset_demo_propietarios();
  select id into v_dueno from public.miembros where hipica_id = v_h and nombre = 'Carmen Ruiz';

  update public.hipicas set num_boxes = 20, revisar_altas = true where id = v_h;

  insert into public.tareas (hipica_id, titulo, detalle, turno, hora, responsable_id) values
    (v_h, 'Toma de pienso',          'Raciones según la dieta de cada caballo', 'manana', '08:00', v_dueno),
    (v_h, 'Sacar al paddock',        'Trueno y Duna juntos',                    'manana', '10:00', null),
    (v_h, 'Limpiar boxes 1 a 12',    'Cama nueva donde haga falta',             'manana', '11:30', null),
    (v_h, 'Recoger paddock',         'Revisar cascos al entrar',                'tarde',  '16:00', null),
    (v_h, 'Preparar caballos de las clases', 'Mirar la lista de cada clase',    'tarde',  '17:00', null),
    (v_h, 'Toma de pienso',          'Raciones según la dieta de cada caballo', 'tarde',  '19:00', v_dueno),
    (v_h, 'Ronda de cierre',         'Agua, puertas y luces',                   'tarde',  '20:00', null);
  insert into public.tareas (hipica_id, titulo, detalle, turno, hora, fecha)
  values (v_h, 'Medicación de Brisa', 'Antiinflamatorio, día 3 de 5', 'manana', '13:00', current_date)
  returning id into v_t;
  insert into public.tareas_hechas (tarea_id, hipica_id, fecha, hecha_por)
  select id, v_h, current_date, v_dueno from public.tareas
  where hipica_id = v_h and titulo = 'Toma de pienso' and turno = 'manana';

  insert into public.existencias (hipica_id, nombre, unidad, cantidad, minimo, consumo_dia, proveedor, proveedor_tel, orden) values
    (v_h, 'Pienso', 'sacos', 6,  10, 2,   'Piensos del Sur', '600 200 001', 1),
    (v_h, 'Heno',   'balas', 22, 8,  2,   'Alfalfas Jerez',  '600 200 002', 2),
    (v_h, 'Paja',   'pacas', 40, 15, 3,   'Alfalfas Jerez',  '600 200 002', 3),
    (v_h, 'Viruta', 'sacos', 14, 8,  1,   null,              null,          4);

  insert into public.profesionales (hipica_id, nombre, oficio, telefono, nota) values
    (v_h, 'Dra. Ruiz',   'veterinario', '600 300 001', 'A demanda. Urgencias 24 h'),
    (v_h, 'Manuel Díaz', 'herrador',    '600 300 002', 'Viene cada 6 semanas'),
    (v_h, 'Lola Pérez',  'fisioterapeuta', '600 300 003', null);

  insert into public.altas (hipica_id, user_id, nombre, telefono, jinetes, caballo, nota, created_at) values
    (v_h, null, 'Beatriz Lara', '600 400 001',
     '[{"nombre": "Daniel Lara", "yo": false, "nivel": "Iniciación", "edad": 9}]', null,
     'Le gustaría empezar en el grupo de ponis de los martes.', now() - interval '3 hours'),
    (v_h, null, 'Andrés Molina', '600 400 002',
     '[{"nombre": "Andrés Molina", "yo": true, "nivel": "Galope 3"}]',
     jsonb_build_object('nombre', 'Canelo', 'raza', 'PRE', 'nacimiento', 2017, 'pupilaje', 'completo',
                        'entrada', to_char(current_date + 10, 'YYYY-MM-DD')),
     null, now() - interval '1 day');

  return v_h;
end;
$$;

revoke execute on function public.reset_demo() from public, anon, authenticated;
