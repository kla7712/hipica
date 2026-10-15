-- =====================================================================
-- 0002 · Horario con plazas libres y vista previa de invitaciones
-- =====================================================================

-- Datos públicos de una invitación válida (nombre de la hípica y rol),
-- para mostrarlos antes de aceptarla. No revela nada si el token no vale.
create function public.ver_invitacion(p_token text)
returns table (hipica_nombre text, rol public.rol_miembro)
language sql stable security definer set search_path = ''
as $$
  select h.nombre, i.rol
  from public.invitaciones i
  join public.hipicas h on h.id = i.hipica_id
  where i.token = p_token
    and i.expira_en > now()
    and (i.usos_max is null or i.usos < i.usos_max)
$$;

-- Sesiones de una hípica entre dos fechas, con plazas ocupadas y la
-- reserva del usuario actual. Los alumnos no pueden leer las reservas
-- de otros, así que el recuento se hace aquí. Máximo 62 días por consulta.
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
  mi_reserva uuid
)
language sql stable security definer set search_path = ''
as $$
  select
    s.id, s.titulo, c.nivel, s.inicio, s.fin, s.plazas,
    (select count(*)::integer from public.reservas r
      where r.sesion_id = s.id and r.estado = 'confirmada'),
    s.cancelada,
    m.nombre,
    (select r.id from public.reservas r
      join public.miembros yo on yo.id = r.miembro_id
      where r.sesion_id = s.id and r.estado = 'confirmada'
        and yo.user_id = (select auth.uid()))
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

revoke execute on function public.ver_invitacion(text) from public, anon;
revoke execute on function public.horario(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.ver_invitacion(text) to authenticated;
grant execute on function public.horario(uuid, timestamptz, timestamptz) to authenticated;
