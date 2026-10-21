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

-- Demo: vuelve a dejar la hípica de ejemplo como nueva cada noche a las 4:00 (UTC).
-- Ejecutar UNA vez, después de la migración 0005 y de crear los dos usuarios demo.
select cron.schedule(
  'reset-demo',
  '0 4 * * *',
  $$ select public.reset_demo() $$
);
