-- Publicación automática del calendario, cada noche a las 3:00 (hora UTC).
-- Requisito: activar la extensión Cron en Supabase
-- (Dashboard → Integrations → Cron → Enable), y después ejecutar esto UNA vez
-- en el SQL Editor.
select cron.schedule(
  'calendario-automatico',
  '0 3 * * *',
  $$ select public.generar_calendario_automatico() $$
);

-- Para comprobar que está programada:
--   select jobname, schedule, active from cron.job;
-- Para ver las últimas ejecuciones:
--   select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
