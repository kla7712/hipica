// Manda al móvil (Web Push) y por email los avisos que la base de datos ha ido dejando.
// Solo se usa en el servidor. No usa la clave service_role: la base de datos
// entrega los avisos a quien conoce el secreto CRON_SECRET (ver migración 0011).
//
// Variables de entorno (en Vercel):
//   CRON_SECRET                    obligatorio: el secreto de privado.ajustes
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY   y VAPID_PRIVATE_KEY: para las notificaciones del móvil
//   VAPID_SUBJECT                  opcional: mailto:tu@email.com
//   RESEND_API_KEY y EMAIL_FROM    opcionales: para los emails ("Tu hípica <avisos@tudominio.es>")
//   SITE_URL                       opcional: https://tudominio.es (si no, la de Vercel)
import webpush, { type PushSubscription } from "web-push";
import { createClient } from "@supabase/supabase-js";

type Fila = {
  id: string;
  titulo: string;
  texto: string;
  url: string;
  hipica: string;
  email: string | null;
  suscripciones: { endpoint: string; p256dh: string; auth: string }[];
};

export type Resultado = { avisos: number; push: number; email: number; fallos: number };

// Los mismos servicios de push que acepta la base de datos.
const PUSH_VALIDO =
  /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)\//;

export function secretoValido() {
  const s = process.env.CRON_SECRET;
  return typeof s === "string" && s.length >= 32 ? s : null;
}

function baseDatos() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function urlSitio() {
  const propia = process.env.SITE_URL?.replace(/\/$/, "");
  if (propia && /^https?:\/\//.test(propia)) return propia;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return vercel ? `https://${vercel}` : null;
}

function configurarPush() {
  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privada = process.env.VAPID_PRIVATE_KEY;
  if (!publica || !privada) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:avisos@example.com", publica, privada);
  return true;
}

const escapar = (t: string) =>
  t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

async function mandarEmail(f: Fila, sitio: string | null) {
  const enlace = sitio && f.url ? `${sitio}${f.url}` : sitio;
  const pie = `Te llega porque estás en ${f.hipica}. Puedes dejar de recibir estos emails en Mi cuenta.`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;color:#16201a">
<p style="font-size:13px;color:#54605a;margin:0 0 4px">${escapar(f.hipica)}</p>
<h1 style="font-size:20px;margin:0 0 12px">${escapar(f.titulo)}</h1>
<p style="font-size:16px;line-height:1.5;margin:0 0 20px">${escapar(f.texto)}</p>
${enlace ? `<p style="margin:0 0 28px"><a href="${escapar(enlace)}" style="background:#1f4d3a;color:#fff;padding:12px 18px;border-radius:12px;text-decoration:none;font-weight:700">Abrir la app</a></p>` : ""}
<p style="font-size:12px;color:#54605a">${escapar(pie)}</p></div>`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [f.email],
      subject: f.titulo,
      text: `${f.texto}\n\n${enlace ? `Ábrelo en la app: ${enlace}\n\n` : ""}${pie}`,
      html,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`email ${r.status}`);
}

// Coge los avisos pendientes y los manda. Cada aviso sale una sola vez aunque
// esto se ejecute a la vez desde dos sitios.
export async function enviarAvisos(): Promise<Resultado> {
  const res: Resultado = { avisos: 0, push: 0, email: 0, fallos: 0 };
  const secreto = secretoValido();
  if (!secreto) return res;

  const db = baseDatos();
  const push = configurarPush();
  const email = Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
  const sitio = urlSitio();

  for (let vuelta = 0; vuelta < 5; vuelta++) {
    const { data, error } = await db.rpc("tomar_avisos", { p_secreto: secreto, p_limite: 100 });
    if (error) {
      console.error("tomar_avisos:", error.message);
      break;
    }
    const filas = (data ?? []) as Fila[];
    if (filas.length === 0) break;
    res.avisos += filas.length;

    const tareas: (() => Promise<void>)[] = [];
    for (const f of filas) {
      if (push) {
        const datos = JSON.stringify({ id: f.id, titulo: f.titulo, texto: f.texto, url: f.url || "/" });
        for (const s of f.suscripciones) {
          if (!PUSH_VALIDO.test(s.endpoint)) continue;
          const sus: PushSubscription = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
          tareas.push(async () => {
            try {
              await webpush.sendNotification(sus, datos, { TTL: 86400, urgency: "normal", timeout: 10_000 });
              res.push++;
            } catch (e) {
              const codigo = (e as { statusCode?: number }).statusCode;
              if (codigo === 404 || codigo === 410) {
                await db.rpc("quitar_suscripcion_caducada", { p_secreto: secreto, p_endpoint: s.endpoint });
              } else {
                res.fallos++;
                console.error("push:", codigo ?? (e as Error).message);
              }
            }
          });
        }
      }
      if (email && f.email) {
        tareas.push(async () => {
          try {
            await mandarEmail(f, sitio);
            res.email++;
          } catch (e) {
            res.fallos++;
            console.error("email:", (e as Error).message);
          }
        });
      }
    }
    // De 10 en 10 para no saturar.
    for (let i = 0; i < tareas.length; i += 10) {
      await Promise.all(tareas.slice(i, i + 10).map((t) => t()));
    }
    if (filas.length < 100) break;
  }
  return res;
}

// Recordatorios del día (clases de mañana, cuidados de pasado mañana).
export async function crearRecordatorios() {
  const secreto = secretoValido();
  if (!secreto) return 0;
  const { data, error } = await baseDatos().rpc("recordatorios_diarios", { p_secreto: secreto });
  if (error) {
    console.error("recordatorios_diarios:", error.message);
    return 0;
  }
  return Number(data) || 0;
}
