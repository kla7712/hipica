"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { UUID } from "@/lib/rutas";
import { avisar } from "@/lib/avisar";

function ids(formData: FormData, ...campos: string[]) {
  const valores = campos.map((c) => String(formData.get(c) ?? ""));
  if (!valores.every((v) => UUID.test(v))) redirect("/");
  return valores;
}
const texto = (formData: FormData, campo: string) => String(formData.get(campo) ?? "").trim();

// Solo admin: aprueba o rechaza un alta hecha desde la app.
export async function revisarAlta(formData: FormData) {
  const [hipicaId, altaId] = ids(formData, "hipica_id", "alta_id");
  const aprobar = formData.get("aprobar") === "true";
  const supabase = await createClient();
  const { error } = await supabase.rpc("revisar_alta", { p_alta: altaId, p_aprobar: aprobar });
  avisar();
  if (error) {
    console.error("revisar alta:", error.message);
    redirect(`/hipica/${hipicaId}/gestion?error=alta`);
  }
  redirect(`/hipica/${hipicaId}/gestion?ok=${aprobar ? "aprobada" : "rechazada"}`);
}

/* ---------- Equipo ---------- */

// Enlace de un solo uso para un monitor o una persona de cuadra (7 días).
export async function invitarEquipo(formData: FormData) {
  const [hipicaId] = ids(formData, "hipica_id");
  const rol = texto(formData, "rol");
  if (!["monitor", "cuadra"].includes(rol)) redirect("/");
  const supabase = await createClient();
  const { error } = await supabase.from("invitaciones").insert({
    hipica_id: hipicaId,
    rol,
    usos_max: 1,
    expira_en: new Date(Date.now() + 7 * 864e5).toISOString(),
  });
  if (error) {
    console.error("invitar equipo:", error.message);
    redirect(`/hipica/${hipicaId}/equipo?error=invitar`);
  }
  refresh();
}

export async function crearProfesional(formData: FormData) {
  const [hipicaId] = ids(formData, "hipica_id");
  const nombre = texto(formData, "nombre");
  const oficio = texto(formData, "oficio");
  const telefono = texto(formData, "telefono");
  const nota = texto(formData, "nota");
  const OFICIOS = ["veterinario", "herrador", "fisioterapeuta", "dentista", "transporte", "otro"];
  if (nombre.length < 1 || nombre.length > 80 || !OFICIOS.includes(oficio) || telefono.length > 30 || nota.length > 120) {
    redirect(`/hipica/${hipicaId}/equipo?error=profesional#profesionales`);
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("profesionales")
    .insert({ hipica_id: hipicaId, nombre, oficio, telefono: telefono || null, nota: nota || null });
  if (error) {
    console.error("crear profesional:", error.message);
    redirect(`/hipica/${hipicaId}/equipo?error=profesional#profesionales`);
  }
  redirect(`/hipica/${hipicaId}/equipo?ok=profesional#profesionales`);
}

export async function borrarProfesional(formData: FormData) {
  const [hipicaId, profesionalId] = ids(formData, "hipica_id", "profesional_id");
  const supabase = await createClient();
  const { error } = await supabase.from("profesionales").delete().eq("id", profesionalId).eq("hipica_id", hipicaId);
  if (error) console.error("borrar profesional:", error.message);
  refresh();
}

export async function bajaEquipo(formData: FormData) {
  const [hipicaId, miembroId] = ids(formData, "hipica_id", "miembro_id");
  const supabase = await createClient();
  const { error } = await supabase.rpc("dar_de_baja", { p_miembro: miembroId });
  avisar();
  if (error) {
    console.error("baja equipo:", error.message);
    redirect(`/hipica/${hipicaId}/equipo?error=baja`);
  }
  redirect(`/hipica/${hipicaId}/equipo?ok=baja`);
}

export async function borrarInvitacionEquipo(formData: FormData) {
  const [hipicaId, invitacionId] = ids(formData, "hipica_id", "invitacion_id");
  const supabase = await createClient();
  const { error } = await supabase.from("invitaciones").delete().eq("id", invitacionId).eq("hipica_id", hipicaId);
  if (error) console.error("borrar invitación:", error.message);
  refresh();
}
