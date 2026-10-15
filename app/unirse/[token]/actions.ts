"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function aceptarInvitacion(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!/^[0-9a-f]{32}$/i.test(token)) redirect("/");
  if (nombre.length < 1 || nombre.length > 120) redirect(`/unirse/${token}?error=nombre`);

  const supabase = await createClient();
  const { data: hipicaId, error } = await supabase.rpc("aceptar_invitacion", {
    p_token: token,
    p_nombre: nombre,
  });

  if (error || !hipicaId) {
    console.error("aceptar_invitacion:", error?.message);
    redirect(`/unirse/${token}?error=invalida`);
  }
  redirect(`/hipica/${hipicaId}`);
}
