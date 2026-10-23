"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Borra la cuenta y todos sus datos (derecho de supresión del RGPD).
export async function borrarCuenta(formData: FormData) {
  if (String(formData.get("confirmacion") ?? "").trim().toUpperCase() !== "BORRAR") {
    redirect("/cuenta?error=confirmar");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("borrar_mi_cuenta");
  if (error) {
    console.error("borrar_mi_cuenta:", error.message);
    redirect(`/cuenta?error=${error.message.includes("único administrador") ? "admin" : "borrar"}`);
  }

  await supabase.auth.signOut();
  redirect("/login?aviso=borrada");
}

/* ---------- Avisos ---------- */

const PUSH_VALIDO =
  /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)\//;

// Activa las notificaciones en este móvil (lo llama el navegador tras dar permiso).
export async function guardarSuscripcion(datos: { endpoint: string; p256dh: string; auth: string }): Promise<boolean> {
  const { endpoint, p256dh, auth } = datos ?? {};
  if (
    typeof endpoint !== "string" || endpoint.length > 1000 || !PUSH_VALIDO.test(endpoint) ||
    typeof p256dh !== "string" || p256dh.length < 1 || p256dh.length > 200 ||
    typeof auth !== "string" || auth.length < 1 || auth.length > 100
  ) {
    return false;
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("guardar_suscripcion", { p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth });
  if (error) console.error("guardar_suscripcion:", error.message);
  return !error;
}

export async function borrarSuscripcion(endpoint: string): Promise<void> {
  if (typeof endpoint !== "string" || endpoint.length > 1000) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("borrar_suscripcion", { p_endpoint: endpoint });
  if (error) console.error("borrar_suscripcion:", error.message);
}

export async function cambiarAvisosEmail(formData: FormData) {
  const activo = formData.get("activo") === "si";
  const supabase = await createClient();
  const { error } = await supabase.rpc("cambiar_avisos_email", { p_activo: activo });
  if (error) console.error("cambiar_avisos_email:", error.message);
  redirect(`/cuenta?ok=${activo ? "email-si" : "email-no"}#avisos`);
}
