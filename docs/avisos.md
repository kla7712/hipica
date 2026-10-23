# Avisos: campana, notificaciones en el móvil y emails

## Qué hace
- Familias: clase cancelada o recuperada, plaza desde la lista de espera,
  recordatorio de la clase de mañana, recibo nuevo, cuidado de su caballo por
  decidir, servicio aceptado o rechazado y avisos del tablón.
- Equipo: servicio pedido (admin y cuadra) y alta por revisar (admin).
- Todo se ve en la campana de la app. Además se manda al móvil (si la persona
  lo activa) y por email (si hay servicio de email configurado).
- En la demo los avisos solo se ven en la campana.

## Puesta en marcha (una vez)
1. Supabase → SQL Editor: ejecuta `supabase/migrations/0011_avisos.sql`.
2. En el mismo SQL Editor, copia el secreto:
   `select valor from privado.ajustes where clave = 'secreto_avisos';`
3. Vercel → Settings → Environment Variables (Production), añade:
   - `CRON_SECRET` = el secreto del paso 2
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY` = las claves de push
     (se generan con `npx web-push generate-vapid-keys`)
   - `VAPID_SUBJECT` = `mailto:` + un email de contacto
4. Vuelve a desplegar (Deployments → … → Redeploy) para que coja las variables.
5. `vercel.json` programa los recordatorios cada día a las 17:00 UTC
   (19:00 en verano, 18:00 en invierno, hora de España). Vercel lo activa solo.

## Emails (cuando haya dominio)
1. Crea una cuenta en Resend, añade el dominio y verifica sus registros DNS.
2. Añade en Vercel `RESEND_API_KEY`, `EMAIL_FROM` (por ejemplo
   `Tu hípica <avisos@tudominio.es>`) y `SITE_URL` (`https://tudominio.es`).
3. Redeploy. Sin estas variables, los emails simplemente no se mandan.

## iPhone
Las notificaciones solo funcionan con la app añadida a la pantalla de inicio
(Compartir → «Añadir a pantalla de inicio») y iOS 16.4 o posterior. La app lo
explica sola.

## Nunca
- No subas las claves a GitHub ni las pongas con `NEXT_PUBLIC_` salvo la pública.
- La app no usa la clave `service_role` en ningún sitio.
