"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { UUID } from "@/lib/rutas";

export async function anadirJinete(formData: FormData) {
  const hipicaId = String(formData.get("hipica_id") ?? "");
  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!UUID.test(hipicaId)) redirect("/");
  if (nombre.length < 1 || nombre.length > 120) redirect(`/hipica/${hipicaId}/familia?error=nombre`);

  const supabase = await createClient();
  const { error } = await supabase.rpc("anadir_jinete", { p_hipica: hipicaId, p_nombre: nombre });
  if (error) {
    console.error("anadir_jinete:", error.message);
    redirect(`/hipica/${hipicaId}/familia?error=${error.message.startsWith("Máximo") ? "maximo" : "anadir"}`);
  }
  redirect(`/hipica/${hipicaId}/familia?ok=anadido`);
}

export async function quitarJinete(formData: FormData) {
  const hipicaId = String(formData.get("hipica_id") ?? "");
  const miembroId = String(formData.get("miembro_id") ?? "");
  if (!UUID.test(hipicaId) || !UUID.test(miembroId)) redirect("/");

  const supabase = await createClient();
  const { error } = await supabase.rpc("quitar_jinete", { p_miembro: miembroId });
  if (error) console.error("quitar_jinete:", error.message);
  refresh();
}
