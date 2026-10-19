"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { UUID } from "@/lib/rutas";

export async function crearInvitacion(formData: FormData) {
  const hipicaId = String(formData.get("hipica_id") ?? "");
  const rol = String(formData.get("rol") ?? "");
  if (!UUID.test(hipicaId) || !["alumno", "monitor"].includes(rol)) redirect("/");

  // Alumnos: un enlace que vale para todos durante 30 días.
  // Monitor: un enlace de un solo uso que caduca en 7 días.
  const dias = rol === "alumno" ? 30 : 7;
  const supabase = await createClient();
  const { error } = await supabase.from("invitaciones").insert({
    hipica_id: hipicaId,
    rol,
    usos_max: rol === "alumno" ? null : 1,
    expira_en: new Date(Date.now() + dias * 864e5).toISOString(),
  });

  if (error) {
    console.error("crear invitación:", error.message);
    redirect(`/hipica/${hipicaId}/miembros?error=invitar`);
  }
  refresh();
}

export async function borrarInvitacion(formData: FormData) {
  const hipicaId = String(formData.get("hipica_id") ?? "");
  const invitacionId = String(formData.get("invitacion_id") ?? "");
  if (!UUID.test(hipicaId) || !UUID.test(invitacionId)) redirect("/");

  const supabase = await createClient();
  const { error } = await supabase
    .from("invitaciones")
    .delete()
    .eq("id", invitacionId)
    .eq("hipica_id", hipicaId);
  if (error) console.error("borrar invitación:", error.message);
  refresh();
}

// Solo admin: da de baja a un miembro (deja de ver la hípica y se anulan sus reservas futuras).
export async function darDeBaja(formData: FormData) {
  const hipicaId = String(formData.get("hipica_id") ?? "");
  const miembroId = String(formData.get("miembro_id") ?? "");
  if (!UUID.test(hipicaId) || !UUID.test(miembroId)) redirect("/");

  const supabase = await createClient();
  const { error } = await supabase.rpc("dar_de_baja", { p_miembro: miembroId });
  if (error) {
    console.error("dar_de_baja:", error.message);
    redirect(`/hipica/${hipicaId}/miembros?error=baja`);
  }
  refresh();
}
