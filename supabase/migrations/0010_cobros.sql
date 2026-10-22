-- =====================================================================
-- 0010 · Cobros
--
-- La app NO emite facturas oficiales (eso lo hace la gestoría o un
-- programa que cumpla Verifactu). Lo que hace:
--   * Tarifas: pupilajes y bonos.
--   * Cargos: lo que debe cada cliente. Se crean solos al vender un bono,
--     al aceptar un servicio con precio y, cada mes, por el pupilaje.
--     El admin puede añadir cargos a mano (herrador, veterinario…).
--   * Recibos: uno por cliente y mes con todos sus cargos. Se marcan como
--     pagados (transferencia, Bizum, efectivo…) o devueltos.
--   * Datos para la factura de cada cliente, para pasárselos a la gestoría.
--
-- El cliente de un cargo es siempre el titular de la cuenta (la madre
-- paga las clases de sus hijos).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tarifas e instrucciones de pago
-- ---------------------------------------------------------------------
alter table public.hipicas
  add column precio_completo numeric(8, 2) check (precio_completo is null or precio_completo between 0 and 100000),
  add column precio_semi     numeric(8, 2) check (precio_semi is null or precio_semi between 0 and 100000),
  add column precio_box      numeric(8, 2) check (precio_box is null or precio_box between 0 and 100000),
  add column instrucciones_pago text check (instrucciones_pago is null or char_length(instrucciones_pago) <= 500);
grant update (precio_completo, precio_semi, precio_box, instrucciones_pago) on public.hipicas to authenticated;

create table public.tarifas_bonos (
  hipica_id uuid not null references public.hipicas (id) on delete cascade,
  clases    smallint not null check (clases between 1 and 100),
  precio    numeric(8, 2) not null check (precio between 0 and 100000),
  primary key (hipica_id, clases)
);
alter table public.tarifas_bonos enable row level security;
create policy tarifas_bonos_select on public.tarifas_bonos
  for select to authenticated using (public.es_miembro(hipica_id));
create policy tarifas_bonos_write on public.tarifas_bonos
  for all to authenticated
  using (public.es_admin(hipica_id)) with check (public.es_admin(hipica_id));
grant select, insert, delete on public.tarifas_bonos to authenticated;
grant update (precio) on public.tarifas_bonos to authenticated;

-- Bonos: su precio y si se cobra (un bono regalado o ya pagado aparte, no).
alter table public.bonos
  add column precio numeric(8, 2) check (precio is null or precio between 0 and 100000),
  add column cobrar boolean not null default true;

-- Datos para la factura (nombre fiscal, NIF, dirección). Los rellena el
-- propio cliente o el admin.
alter table public.miembros
  add column datos_factura text check (datos_factura is null or char_length(datos_factura) <= 300);
grant update (datos_factura) on public.miembros to authenticated;

-- Un monitor no puede tocar los datos de factura de nadie.
create or replace function public.limitar_monitor()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and not public.es_admin(old.hipica_id)
     and old.user_id is distinct from (select auth.uid())
     and not public.es_mi_ficha(old.titular_id)
     and (new.nombre is distinct from old.nombre
          or new.telefono is distinct from old.telefono
          or new.datos_factura is distinct from old.datos_factura) then
    raise exception 'Solo el administrador puede cambiar estos datos';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Recibos y cargos
-- ---------------------------------------------------------------------
create table public.recibos (
  id         uuid primary key default gen_random_uuid(),
  hipica_id  uuid not null references public.hipicas (id) on delete cascade,
  cliente_id uuid not null,
  mes        date not null check (extract(day from mes) = 1),
  numero     integer not null,
  total      numeric(10, 2) not null default 0,
  estado     text not null default 'pendiente' check (estado in ('pendiente', 'pagado', 'devuelto')),
  metodo     text check (metodo in ('transferencia', 'bizum', 'efectivo', 'tarjeta', 'domiciliacion')),
  pagado_en  date,
  created_at timestamptz not null default now(),
  unique (cliente_id, mes),
  unique (hipica_id, numero),
  unique (id, hipica_id),
  foreign key (cliente_id, hipica_id) references public.miembros (id, hipica_id) on delete cascade
);
create index recibos_hipica_mes_idx on public.recibos (hipica_id, mes);

create table public.cargos (
  id         uuid primary key default gen_random_uuid(),
  hipica_id  uuid not null references public.hipicas (id) on delete cascade,
  cliente_id uuid not null,
  mes        date not null check (extract(day from mes) = 1),
  concepto   text not null check (char_length(concepto) between 1 and 120),
  importe    numeric(10, 2) not null check (importe between -100000 and 100000),
  origen     text not null default 'manual' check (origen in ('pupilaje', 'bono', 'servicio', 'manual')),
  origen_id  uuid,
  recibo_id  uuid,
  created_at timestamptz not null default now(),
  foreign key (cliente_id, hipica_id) references public.miembros (id, hipica_id) on delete cascade,
  foreign key (recibo_id, hipica_id) references public.recibos (id, hipica_id) on delete set null (recibo_id)
);
create unique index cargos_origen_unico on public.cargos (origen, origen_id, mes) where origen_id is not null;
create index cargos_hipica_idx on public.cargos (hipica_id, mes);
create index cargos_cliente_idx on public.cargos (cliente_id);
create index cargos_recibo_idx on public.cargos (recibo_id);

alter table public.recibos enable row level security;
alter table public.cargos  enable row level security;

create policy recibos_select on public.recibos
  for select to authenticated using (public.es_admin(hipica_id) or public.puedo_gestionar(cliente_id));
create policy cargos_select on public.cargos
  for select to authenticated using (public.es_admin(hipica_id) or public.puedo_gestionar(cliente_id));
-- Cargos a mano: los pone el admin. Solo se borran si aún no están en un recibo.
create policy cargos_insert on public.cargos
  for insert to authenticated with check (public.es_admin(hipica_id) and origen = 'manual' and recibo_id is null);
create policy cargos_delete on public.cargos
  for delete to authenticated using (public.es_admin(hipica_id) and recibo_id is null);

grant select on public.recibos to authenticated;
grant select, delete on public.cargos to authenticated;
grant insert (hipica_id, cliente_id, mes, concepto, importe, origen) on public.cargos to authenticated;

-- Quién paga por un miembro: su titular, o él mismo.
create function public._cliente_de(p_miembro uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$ select coalesce(titular_id, id) from public.miembros where id = p_miembro $$;

-- ---------------------------------------------------------------------
-- 3. Cargos automáticos
-- ---------------------------------------------------------------------

-- Bono: si no se indica precio, se usa la tarifa de ese número de clases.
create function public.bono_precio()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.precio is null and new.cobrar then
    select precio into new.precio from public.tarifas_bonos where hipica_id = new.hipica_id and clases = new.clases;
  end if;
  return new;
end;
$$;
create trigger bonos_precio before insert on public.bonos
for each row execute function public.bono_precio();

create function public.bono_cargo()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.cargos where origen = 'bono' and origen_id = old.id and recibo_id is null;
    return old;
  end if;
  if new.cobrar and coalesce(new.precio, 0) > 0 then
    insert into public.cargos (hipica_id, cliente_id, mes, concepto, importe, origen, origen_id)
    select new.hipica_id, public._cliente_de(new.miembro_id), date_trunc('month', current_date)::date,
           left('Bono de ' || new.clases || case when new.clases = 1 then ' clase' else ' clases' end || ' · ' || m.nombre, 120),
           new.precio, 'bono', new.id
    from public.miembros m where m.id = new.miembro_id
    on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger bonos_cargo after insert or delete on public.bonos
for each row execute function public.bono_cargo();

-- Servicio aceptado con precio → cargo al propietario. Rechazado → se quita.
create function public.solicitud_cargo()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_cliente uuid;
  v_caballo text;
begin
  if new.estado in ('aceptada', 'hecha') and new.total > 0 then
    select public._cliente_de(c.propietario_id), c.nombre into v_cliente, v_caballo
    from public.caballos c where c.id = new.caballo_id;
    if v_cliente is not null then
      insert into public.cargos (hipica_id, cliente_id, mes, concepto, importe, origen, origen_id)
      values (new.hipica_id, v_cliente, date_trunc('month', new.fecha)::date,
              left((select string_agg(x ->> 'nombre', ', ') from jsonb_array_elements(new.servicios) x)
                   || ' · ' || v_caballo || ' · ' || to_char(new.fecha, 'DD/MM'), 120),
              new.total, 'servicio', new.id)
      on conflict do nothing;
    end if;
  elsif new.estado in ('rechazada', 'pendiente') then
    delete from public.cargos where origen = 'servicio' and origen_id = new.id and recibo_id is null;
  end if;
  return new;
end;
$$;
create trigger solicitudes_cargo after update of estado on public.solicitudes
for each row when (old.estado is distinct from new.estado)
execute function public.solicitud_cargo();

-- ---------------------------------------------------------------------
-- 4. Recibos del mes
-- ---------------------------------------------------------------------
create function public._generar_recibos(p_hipica uuid, p_mes date)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_mes date := date_trunc('month', p_mes)::date;
  v_nombre_mes text;
  c record;
  v_recibo uuid;
  v_estado text;
  v_n integer := 0;
begin
  v_nombre_mes := (array['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'])[extract(month from v_mes)];

  -- Pupilaje del mes de cada caballo de propietario.
  insert into public.cargos (hipica_id, cliente_id, mes, concepto, importe, origen, origen_id)
  select cb.hipica_id, public._cliente_de(cb.propietario_id), v_mes,
         left(case cb.pupilaje when 'completo' then 'Pupilaje completo' when 'semi' then 'Semipupilaje' else 'Solo box' end
              || ' · ' || cb.nombre || ' · ' || v_nombre_mes, 120),
         case cb.pupilaje when 'completo' then h.precio_completo when 'semi' then h.precio_semi else h.precio_box end,
         'pupilaje', cb.id
  from public.caballos cb
  join public.hipicas h on h.id = cb.hipica_id
  join public.miembros m on m.id = cb.propietario_id and m.activo
  where cb.hipica_id = p_hipica and cb.activo and cb.tipo = 'propietario' and cb.pupilaje is not null
    and coalesce(case cb.pupilaje when 'completo' then h.precio_completo when 'semi' then h.precio_semi else h.precio_box end, 0) > 0
  on conflict do nothing;

  -- Un recibo por cliente con todo lo que tenga pendiente hasta ese mes.
  for c in
    select distinct cliente_id from public.cargos
    where hipica_id = p_hipica and recibo_id is null and mes <= v_mes
  loop
    select id, estado into v_recibo, v_estado from public.recibos where cliente_id = c.cliente_id and mes = v_mes;
    if v_recibo is null then
      insert into public.recibos (hipica_id, cliente_id, mes, numero)
      values (p_hipica, c.cliente_id, v_mes,
              coalesce((select max(numero) from public.recibos where hipica_id = p_hipica), 0) + 1)
      returning id into v_recibo;
      v_estado := 'pendiente';
    end if;
    -- A un recibo ya pagado no se le añade nada: irá en el siguiente.
    continue when v_estado <> 'pendiente';
    update public.cargos set recibo_id = v_recibo
    where hipica_id = p_hipica and cliente_id = c.cliente_id and recibo_id is null and mes <= v_mes;
    update public.recibos
    set total = (select coalesce(sum(importe), 0) from public.cargos where recibo_id = v_recibo)
    where id = v_recibo;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

create function public.generar_recibos(p_hipica uuid, p_mes date)
returns integer
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.es_admin(p_hipica) then
    raise exception 'Solo el administrador genera los recibos';
  end if;
  if p_mes is null or p_mes < (date_trunc('month', current_date) - interval '12 months')::date
     or p_mes > (date_trunc('month', current_date) + interval '1 month')::date then
    raise exception 'Mes no válido';
  end if;
  return public._generar_recibos(p_hipica, p_mes);
end;
$$;

create function public.marcar_recibo(p_recibo uuid, p_estado text, p_metodo text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_hipica uuid;
begin
  select hipica_id into v_hipica from public.recibos where id = p_recibo for update;
  if v_hipica is null or not public.es_admin(v_hipica) then
    raise exception 'No puedes cambiar este recibo';
  end if;
  if p_estado not in ('pendiente', 'pagado', 'devuelto')
     or (p_metodo is not null and p_metodo not in ('transferencia', 'bizum', 'efectivo', 'tarjeta', 'domiciliacion')) then
    raise exception 'Estado no válido';
  end if;
  update public.recibos
  set estado = p_estado,
      metodo = case when p_estado = 'pendiente' then null else coalesce(p_metodo, metodo) end,
      pagado_en = case when p_estado = 'pagado' then current_date else null end
  where id = p_recibo;
end;
$$;

-- Quita un cargo de un recibo pendiente (vuelve a "sin recibo") o lo borra.
create function public.quitar_cargo(p_cargo uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  c public.cargos%rowtype;
  v_estado text;
begin
  select * into c from public.cargos where id = p_cargo for update;
  if not found or not public.es_admin(c.hipica_id) then
    raise exception 'No puedes quitar este cargo';
  end if;
  if c.recibo_id is not null then
    select estado into v_estado from public.recibos where id = c.recibo_id;
    if v_estado <> 'pendiente' then
      raise exception 'El recibo ya está cobrado';
    end if;
  end if;
  delete from public.cargos where id = p_cargo;
  if c.recibo_id is not null then
    update public.recibos
    set total = (select coalesce(sum(importe), 0) from public.cargos where recibo_id = c.recibo_id)
    where id = c.recibo_id;
    delete from public.recibos r where r.id = c.recibo_id
      and not exists (select 1 from public.cargos where recibo_id = r.id);
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Permisos de las funciones
-- ---------------------------------------------------------------------
revoke execute on function
  public._cliente_de(uuid), public.bono_precio(), public.bono_cargo(), public.solicitud_cargo(),
  public._generar_recibos(uuid, date), public.generar_recibos(uuid, date),
  public.marcar_recibo(uuid, text, text), public.quitar_cargo(uuid)
from public, anon;
revoke execute on function
  public._cliente_de(uuid), public.bono_precio(), public.bono_cargo(), public.solicitud_cargo(),
  public._generar_recibos(uuid, date)
from authenticated;
grant execute on function
  public.generar_recibos(uuid, date), public.marcar_recibo(uuid, text, text), public.quitar_cargo(uuid)
to authenticated;

-- ---------------------------------------------------------------------
-- 6. Demo: tarifas, recibos del mes pasado y cargos de este mes
-- ---------------------------------------------------------------------
alter function public.reset_demo() rename to _reset_demo_cuadra;
revoke execute on function public._reset_demo_cuadra() from public, anon, authenticated;

create function public.reset_demo()
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_h uuid;
  v_pasado date := (date_trunc('month', current_date) - interval '1 month')::date;
  v_madre uuid;
  v_javier uuid;
  v_irene uuid;
  v_nora uuid;
  r record;
  i integer := 0;
begin
  v_h := public._reset_demo_cuadra();

  update public.hipicas
  set precio_completo = 395, precio_semi = 260, precio_box = 180,
      instrucciones_pago = 'Transferencia a ES12 3456 7890 1234 5678 9012 (Hípica La Dehesa) o Bizum al 600 000 001. '
                           || 'Pon tu nombre y el número de recibo en el concepto.'
  where id = v_h;
  insert into public.tarifas_bonos (hipica_id, clases, precio) values (v_h, 4, 65), (v_h, 8, 120), (v_h, 5, 80), (v_h, 2, 35);

  select id into v_madre from public.miembros where hipica_id = v_h and nombre = 'Marta López';
  select id into v_javier from public.miembros where hipica_id = v_h and nombre = 'Javier Sánchez';
  select id into v_irene from public.miembros where hipica_id = v_h and nombre = 'Irene Castro';
  select id into v_nora from public.miembros where hipica_id = v_h and nombre = 'Nora Delgado';
  update public.miembros set datos_factura = 'Marta López García · 12345678Z · C/ Larga 1, 11402 Jerez de la Frontera'
  where id = v_madre;

  -- Los bonos de la demo se vendieron este mes: cargo por cada uno.
  update public.bonos b set precio = t.precio
  from public.tarifas_bonos t where t.hipica_id = v_h and t.clases = b.clases and b.hipica_id = v_h;
  insert into public.cargos (hipica_id, cliente_id, mes, concepto, importe, origen, origen_id)
  select b.hipica_id, public._cliente_de(b.miembro_id), date_trunc('month', current_date)::date,
         'Bono de ' || b.clases || ' clases · ' || m.nombre, b.precio, 'bono', b.id
  from public.bonos b join public.miembros m on m.id = b.miembro_id
  where b.hipica_id = v_h and b.precio > 0;

  -- El servicio que ya se hizo para Trueno.
  insert into public.cargos (hipica_id, cliente_id, mes, concepto, importe, origen, origen_id)
  select s.hipica_id, v_madre, date_trunc('month', s.fecha)::date, 'Montarlo · Trueno · ' || to_char(s.fecha, 'DD/MM'),
         s.total, 'servicio', s.id
  from public.solicitudes s where s.hipica_id = v_h and s.estado = 'hecha';

  -- Mes pasado: pupilajes y algunas clases, con recibos ya generados.
  insert into public.cargos (hipica_id, cliente_id, mes, concepto, importe, origen)
  values
    (v_h, v_madre,  v_pasado, 'Herrador · Trueno', 60, 'manual'),
    (v_h, v_nora,   v_pasado, 'Bono de 8 clases · Nora Delgado', 120, 'manual'),
    (v_h, v_javier, v_pasado, '4 horas de pista libre', 40, 'manual');
  insert into public.cargos (hipica_id, cliente_id, mes, concepto, importe, origen, origen_id)
  select cb.hipica_id, cb.propietario_id, v_pasado,
         case cb.pupilaje when 'completo' then 'Pupilaje completo' when 'semi' then 'Semipupilaje' else 'Solo box' end
           || ' · ' || cb.nombre,
         case cb.pupilaje when 'completo' then 395 when 'semi' then 260 else 180 end, 'pupilaje', cb.id
  from public.caballos cb where cb.hipica_id = v_h and cb.tipo = 'propietario' and cb.propietario_id is not null;
  -- Recibos del mes pasado (solo llevan lo del mes pasado; lo de este mes queda pendiente).
  perform public._generar_recibos(v_h, v_pasado);

  for r in select id, cliente_id from public.recibos where hipica_id = v_h order by numero loop
    i := i + 1;
    if r.cliente_id = v_javier then
      update public.recibos set estado = 'devuelto', metodo = 'transferencia' where id = r.id;
    elsif r.cliente_id = v_irene then
      null;  -- pendiente
    else
      update public.recibos set estado = 'pagado', metodo = case when i % 2 = 0 then 'bizum' else 'transferencia' end,
             pagado_en = v_pasado + 4 + i where id = r.id;
    end if;
  end loop;

  return v_h;
end;
$$;

revoke execute on function public.reset_demo() from public, anon, authenticated;
