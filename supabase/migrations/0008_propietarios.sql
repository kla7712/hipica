-- =====================================================================
-- 0008 · Caballos de propietarios, cuidados y servicios
--
--   * Caballos de propietario: de quién es, box, tipo de pupilaje,
--     dónde está ahora (box, paddock, pista, fuera) y su dieta.
--   * Cuidados: herrador, vacunas, desparasitación, dentista… con fecha.
--     Al marcarlos como hechos se programa el siguiente. El propietario
--     puede decir si se encarga la hípica o él.
--   * Servicios: lo que la hípica ofrece a los propietarios (montarlo,
--     ducha, mantas…) y las solicitudes que hacen. Las aceptadas quedan
--     guardadas con su precio para cobrarlas más adelante.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Caballos: propietario, box, pupilaje, ubicación y dieta
-- ---------------------------------------------------------------------
alter table public.caballos
  add column propietario_id uuid,
  add column box text check (box is null or char_length(box) <= 20),
  add column pupilaje text check (pupilaje in ('completo', 'semi', 'box')),
  add column ubicacion text not null default 'box' check (ubicacion in ('box', 'paddock', 'pista', 'fuera')),
  add column ubicacion_desde timestamptz not null default now(),
  add column raza text check (raza is null or char_length(raza) <= 60),
  add column nacimiento smallint check (nacimiento is null or nacimiento between 1980 and 2100),
  add column dieta text check (dieta is null or char_length(dieta) <= 500),
  add constraint caballos_propietario_fk foreign key (propietario_id, hipica_id)
    references public.miembros (id, hipica_id) on delete set null (propietario_id);
create index caballos_propietario_idx on public.caballos (propietario_id);

-- ¿Es mío este caballo? (soy su propietario, o lo es alguien a mi cargo)
create function public.es_mi_caballo(p_caballo uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.caballos c
    where c.id = p_caballo and c.activo and c.propietario_id is not null
      and public.puedo_gestionar(c.propietario_id)
  )
$$;

drop policy caballos_select on public.caballos;
create policy caballos_select on public.caballos
  for select to authenticated using (
    public.es_staff(hipica_id) or (activo and propietario_id is not null and public.puedo_gestionar(propietario_id))
  );

grant update (propietario_id, box, pupilaje, raza, nacimiento, dieta) on public.caballos to authenticated;

-- El equipo (admin o monitor) cambia dónde está un caballo. El propietario lo ve al momento.
create function public.mover_caballo(p_caballo uuid, p_ubicacion text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_hipica uuid;
begin
  select hipica_id into v_hipica from public.caballos where id = p_caballo and activo;
  if v_hipica is null or not public.es_staff(v_hipica) then
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

-- ---------------------------------------------------------------------
-- 2. Cuidados (herrador, vacunas…)
-- ---------------------------------------------------------------------
create table public.cuidados (
  id          uuid primary key default gen_random_uuid(),
  hipica_id   uuid not null references public.hipicas (id) on delete cascade,
  caballo_id  uuid not null,
  tipo        text not null check (tipo in ('herrador', 'vacuna', 'desparasitacion', 'dentista', 'veterinario', 'otro')),
  fecha       date not null,
  nota        text check (nota is null or char_length(nota) <= 300),
  hecho       boolean not null default false,
  hecho_en    date,
  responsable text check (responsable in ('hipica', 'propietario')),
  created_at  timestamptz not null default now(),
  unique (id, hipica_id),
  foreign key (caballo_id, hipica_id) references public.caballos (id, hipica_id) on delete cascade
);
create index cuidados_caballo_idx on public.cuidados (caballo_id, fecha);
create index cuidados_pendientes_idx on public.cuidados (hipica_id, fecha) where not hecho;

alter table public.cuidados enable row level security;
create policy cuidados_select on public.cuidados
  for select to authenticated using (public.es_staff(hipica_id) or public.es_mi_caballo(caballo_id));
create policy cuidados_write on public.cuidados
  for all to authenticated
  using (public.es_staff(hipica_id)) with check (public.es_staff(hipica_id));

grant select, insert, delete on public.cuidados to authenticated;
grant update (tipo, fecha, nota, responsable) on public.cuidados to authenticated;

-- Marca un cuidado como hecho y programa el siguiente (herrador cada 6
-- semanas, desparasitación cada 3 meses, vacuna y dentista cada año).
create function public.cuidado_hecho(p_cuidado uuid, p_nota text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  c public.cuidados%rowtype;
  v_dias integer;
  v_siguiente uuid;
begin
  select * into c from public.cuidados where id = p_cuidado and not hecho for update;
  if not found or not public.es_staff(c.hipica_id) then
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

-- El propietario dice quién se encarga: la hípica o él (trae su veterinario…).
create function public.responder_cuidado(p_cuidado uuid, p_responsable text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_caballo uuid;
begin
  select caballo_id into v_caballo from public.cuidados where id = p_cuidado and not hecho;
  if v_caballo is null or not public.es_mi_caballo(v_caballo) then
    raise exception 'No puedes responder a este cuidado';
  end if;
  if p_responsable not in ('hipica', 'propietario') then
    raise exception 'Respuesta no válida';
  end if;
  update public.cuidados set responsable = p_responsable where id = p_cuidado;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Servicios y solicitudes
-- ---------------------------------------------------------------------
create table public.servicios (
  id          uuid primary key default gen_random_uuid(),
  hipica_id   uuid not null references public.hipicas (id) on delete cascade,
  nombre      text not null check (char_length(nombre) between 1 and 60),
  descripcion text check (descripcion is null or char_length(descripcion) <= 120),
  precio      numeric(8, 2) check (precio is null or precio between 0 and 10000),  -- null = según tarifa
  orden       smallint not null default 0,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (id, hipica_id)
);
create index servicios_hipica_idx on public.servicios (hipica_id);

create table public.solicitudes (
  id         uuid primary key default gen_random_uuid(),
  hipica_id  uuid not null references public.hipicas (id) on delete cascade,
  caballo_id uuid not null,
  miembro_id uuid,                                  -- quién la pidió
  fecha      date not null,
  servicios  jsonb not null,                        -- [{id, nombre, precio}] tal como estaban al pedir
  total      numeric(10, 2) not null default 0,
  nota       text check (nota is null or char_length(nota) <= 300),
  estado     text not null default 'pendiente' check (estado in ('pendiente', 'aceptada', 'rechazada', 'hecha')),
  created_at timestamptz not null default now(),
  foreign key (caballo_id, hipica_id) references public.caballos (id, hipica_id) on delete cascade,
  foreign key (miembro_id, hipica_id) references public.miembros (id, hipica_id) on delete set null (miembro_id)
);
create index solicitudes_hipica_idx on public.solicitudes (hipica_id, estado, fecha);
create index solicitudes_caballo_idx on public.solicitudes (caballo_id);

alter table public.servicios   enable row level security;
alter table public.solicitudes enable row level security;

create policy servicios_select on public.servicios
  for select to authenticated using (public.es_miembro(hipica_id));
create policy servicios_write on public.servicios
  for all to authenticated
  using (public.es_admin(hipica_id)) with check (public.es_admin(hipica_id));

-- Solicitudes: solo mediante funciones.
create policy solicitudes_select on public.solicitudes
  for select to authenticated using (public.es_staff(hipica_id) or public.es_mi_caballo(caballo_id));

grant select, insert, delete on public.servicios to authenticated;
grant update (nombre, descripcion, precio, orden, activo) on public.servicios to authenticated;
grant select on public.solicitudes to authenticated;

-- El propietario (o el equipo) pide uno o varios servicios para un día.
create function public.pedir_servicios(p_caballo uuid, p_servicios uuid[], p_fecha date, p_nota text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_hipica uuid;
  v_yo uuid;
  v_items jsonb;
  v_total numeric;
  v_n integer;
  v_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Hay que iniciar sesión';
  end if;
  select hipica_id into v_hipica from public.caballos where id = p_caballo and activo;
  if v_hipica is null or not (public.es_mi_caballo(p_caballo) or public.es_staff(v_hipica)) then
    raise exception 'No puedes pedir servicios para este caballo';
  end if;
  if p_fecha is null or p_fecha < current_date or p_fecha > current_date + 60 then
    raise exception 'Elige un día de los próximos dos meses';
  end if;
  if p_nota is not null and char_length(p_nota) > 300 then
    raise exception 'Nota demasiado larga';
  end if;
  if coalesce(array_length(p_servicios, 1), 0) = 0 or array_length(p_servicios, 1) > 10 then
    raise exception 'Elige al menos un servicio';
  end if;
  if (select count(*) from public.solicitudes
      where caballo_id = p_caballo and estado = 'pendiente') >= 10 then
    raise exception 'Hay demasiadas solicitudes pendientes';
  end if;

  select jsonb_agg(jsonb_build_object('id', s.id, 'nombre', s.nombre, 'precio', s.precio) order by s.orden, s.nombre),
         coalesce(sum(s.precio), 0), count(*)
  into v_items, v_total, v_n
  from public.servicios s
  where s.hipica_id = v_hipica and s.activo and s.id = any (p_servicios);
  if v_n = 0 or v_n <> (select count(distinct x) from unnest(p_servicios) x) then
    raise exception 'Servicio no encontrado';
  end if;

  select id into v_yo from public.miembros
  where hipica_id = v_hipica and user_id = (select auth.uid()) and activo;

  insert into public.solicitudes (hipica_id, caballo_id, miembro_id, fecha, servicios, total, nota)
  values (v_hipica, p_caballo, v_yo, p_fecha, v_items, v_total, nullif(trim(p_nota), ''))
  returning id into v_id;
  return v_id;
end;
$$;

-- El equipo acepta, rechaza o marca como hecha una solicitud.
-- El propietario puede retirarla mientras esté pendiente.
create function public.responder_solicitud(p_solicitud uuid, p_estado text)
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
  if not public.es_staff(s.hipica_id) then
    raise exception 'Solo la hípica responde a las solicitudes';
  end if;
  if p_estado not in ('aceptada', 'rechazada', 'hecha', 'pendiente') then
    raise exception 'Estado no válido';
  end if;
  update public.solicitudes set estado = p_estado where id = p_solicitud;
end;
$$;

-- Servicios típicos para empezar (el admin los ajusta después).
create function public.servicios_tipicos(p_hipica uuid)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_n integer;
begin
  if not public.es_admin(p_hipica) then
    raise exception 'Solo el administrador';
  end if;
  insert into public.servicios (hipica_id, nombre, descripcion, precio, orden)
  select p_hipica, x.nombre, x.descripcion, x.precio, x.orden
  from (values
    ('Montarlo',      '45 min con un profesor',        25::numeric, 1),
    ('Dar cuerda',    '20 min en el redondel',         15,          2),
    ('Paddock extra', 'Una salida más al día',         0,           3),
    ('Ducha',         'Con champú y secado',           5,           4),
    ('Mantas',        'Poner y quitar durante 7 días', 15,          5),
    ('Herrador',      'En su próxima visita',          null,        6),
    ('Veterinario',   'Revisión en la hípica',         null,        7),
    ('Transporte',    'A concurso o clínica',          null,        8)
  ) as x(nombre, descripcion, precio, orden)
  where not exists (select 1 from public.servicios s where s.hipica_id = p_hipica and s.nombre = x.nombre);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Horario: el propietario ve el nombre de su caballo (ya lo hacía con
--    los de escuela). Las reglas de asignar_caballo valen igual.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 5. Permisos de las funciones
-- ---------------------------------------------------------------------
revoke execute on function
  public.es_mi_caballo(uuid), public.mover_caballo(uuid, text),
  public.cuidado_hecho(uuid, text), public.responder_cuidado(uuid, text),
  public.pedir_servicios(uuid, uuid[], date, text), public.responder_solicitud(uuid, text),
  public.servicios_tipicos(uuid)
from public, anon;

grant execute on function
  public.es_mi_caballo(uuid), public.mover_caballo(uuid, text),
  public.cuidado_hecho(uuid, text), public.responder_cuidado(uuid, text),
  public.pedir_servicios(uuid, uuid[], date, text), public.responder_solicitud(uuid, text),
  public.servicios_tipicos(uuid)
to authenticated;

-- ---------------------------------------------------------------------
-- 6. Demo: la familia de la demo tiene además un caballo en pupilaje
-- ---------------------------------------------------------------------
alter function public.reset_demo() rename to _reset_demo_escuela;
revoke execute on function public._reset_demo_escuela() from public, anon, authenticated;

create function public.reset_demo()
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_h uuid;
  v_madre uuid;
  v_javier uuid;
  v_irene uuid;
  v_trueno uuid;
  v_lucero uuid;
  v_duna uuid;
  v_brisa uuid;
  v_ducha uuid;
  v_mantas uuid;
  v_montar uuid;
begin
  v_h := public._reset_demo_escuela();

  select id into v_madre from public.miembros where hipica_id = v_h and nombre = 'Marta López';
  select id into v_javier from public.miembros where hipica_id = v_h and nombre = 'Javier Sánchez';
  select id into v_irene from public.miembros where hipica_id = v_h and nombre = 'Irene Castro';
  select id into v_brisa from public.caballos where hipica_id = v_h and nombre = 'Brisa';

  -- Caballos de propietarios
  insert into public.caballos (hipica_id, nombre, tipo, propietario_id, box, pupilaje, raza, nacimiento, ubicacion, ubicacion_desde, dieta, max_clases_dia)
  values (v_h, 'Trueno', 'propietario', v_madre, '7', 'completo', 'Pura raza española', 2015, 'paddock',
          least(now(), (current_date + time '10:15') at time zone 'Europe/Madrid'),
          'Mañana: 2 kg de pienso y heno. Tarde: 1,5 kg de pienso y heno.', 2)
  returning id into v_trueno;
  insert into public.caballos (hipica_id, nombre, tipo, propietario_id, box, pupilaje, raza, nacimiento, ubicacion, dieta, max_clases_dia)
  values (v_h, 'Lucero', 'propietario', v_javier, '3', 'semi', 'Hannoveriano', 2012, 'box',
          'Heno a voluntad. 1 kg de pienso por la tarde.', 2)
  returning id into v_lucero;
  insert into public.caballos (hipica_id, nombre, tipo, propietario_id, box, pupilaje, raza, nacimiento, ubicacion, max_clases_dia)
  values (v_h, 'Duna', 'propietario', v_irene, '1', 'completo', 'Árabe', 2018, 'paddock', 2)
  returning id into v_duna;
  update public.caballos set box = x.box
  from (values ('Nube', '16'), ('Bambú', '9'), ('Rayo', '14'), ('Perla', '15'), ('Sol', '17'),
               ('Lirio', '18'), ('Canela', '5'), ('Brisa', '12')) as x(nombre, box)
  where caballos.hipica_id = v_h and caballos.nombre = x.nombre;

  -- Cuidados: vacuna de Trueno en 4 días (la madre tiene que responder),
  -- herrador mañana, historial…
  insert into public.cuidados (hipica_id, caballo_id, tipo, fecha, nota, hecho, hecho_en) values
    (v_h, v_trueno, 'vacuna',          current_date + 4,   'Gripe y tétanos', false, null),
    (v_h, v_trueno, 'herrador',        current_date + 1,   null,              false, null),
    (v_h, v_trueno, 'desparasitacion', current_date + 41,  null,              false, null),
    (v_h, v_trueno, 'herrador',        current_date - 41,  'Herrado de manos.', true, current_date - 41),
    (v_h, v_trueno, 'desparasitacion', current_date - 49,  'Ivermectina.',    true, current_date - 49),
    (v_h, v_lucero, 'herrador',        current_date + 1,   null,              false, null),
    (v_h, v_lucero, 'vacuna',          current_date + 120, null,              false, null),
    (v_h, v_duna,   'dentista',        current_date - 2,   null,              false, null),
    (v_h, v_brisa,  'veterinario',     current_date + 3,   'Revisar la cojera', false, null);

  -- Servicios y solicitudes
  insert into public.servicios (hipica_id, nombre, descripcion, precio, orden) values
    (v_h, 'Montarlo',      '45 min con un profesor',        25,   1),
    (v_h, 'Dar cuerda',    '20 min en el redondel',         15,   2),
    (v_h, 'Paddock extra', 'Una salida más al día',         0,    3),
    (v_h, 'Ducha',         'Con champú y secado',           5,    4),
    (v_h, 'Mantas',        'Poner y quitar durante 7 días', 15,   5),
    (v_h, 'Herrador',      'En su próxima visita',          null, 6),
    (v_h, 'Veterinario',   'Revisión en la hípica',         null, 7),
    (v_h, 'Transporte',    'A concurso o clínica',          null, 8);
  select id into v_ducha from public.servicios where hipica_id = v_h and nombre = 'Ducha';
  select id into v_mantas from public.servicios where hipica_id = v_h and nombre = 'Mantas';
  select id into v_montar from public.servicios where hipica_id = v_h and nombre = 'Montarlo';

  insert into public.solicitudes (hipica_id, caballo_id, miembro_id, fecha, servicios, total, nota, estado, created_at) values
    (v_h, v_lucero, v_javier, current_date + 1,
     jsonb_build_array(jsonb_build_object('id', v_ducha, 'nombre', 'Ducha', 'precio', 5),
                       jsonb_build_object('id', v_mantas, 'nombre', 'Mantas', 'precio', 15)),
     20, 'Ducha antes de poner las mantas, por favor.', 'pendiente', now() - interval '3 hours'),
    (v_h, v_trueno, v_madre, current_date - 2,
     jsonb_build_array(jsonb_build_object('id', v_montar, 'nombre', 'Montarlo', 'precio', 25)),
     25, null, 'hecha', now() - interval '4 days');

  return v_h;
end;
$$;

revoke execute on function public.reset_demo() from public, anon, authenticated;
