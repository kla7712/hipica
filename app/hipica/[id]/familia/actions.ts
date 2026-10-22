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

// El titular guarda sus datos para la factura.
export async function guardarDatosFactura(formData: FormData) {
  const hipicaId = String(formData.get("hipica_id") ?? "");
  const miembroId = String(formData.get("miembro_id") ?? "");
  const datos = String(formData.get("datos_factura") ?? "").trim();
  if (!UUID.test(hipicaId) || !UUID.test(miembroId)) redirect("/");
  if (datos.length > 300) redirect(`/hipica/${hipicaId}/familia?error=factura_error#factura`);
  const supabase = await createClient();
  const { error } = await supabase.from("miembros").update({ datos_factura: datos || null }).eq("id", miembroId).eq("hipica_id", hipicaId);
  if (error) {
    console.error("datos factura:", error.message);
    redirect(`/hipica/${hipicaId}/familia?error=factura_error#factura`);
  }
  redirect(`/hipica/${hipicaId}/familia?ok=factura#factura`);
}
