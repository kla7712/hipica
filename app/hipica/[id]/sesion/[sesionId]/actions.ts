"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { UUID } from "@/lib/rutas";

function ids(formData: FormData, ...campos: string[]) {
  const valores = campos.map((c) => String(formData.get(c) ?? ""));
  if (!valores.every((v) => UUID.test(v))) redirect("/");
  return valores;
}

// Monitor o admin: marca si el alumno vino (true), no vino (false) o lo deja sin marcar.
export async function marcarAsistencia(formData: FormData) {
  const [reservaId] = ids(formData, "reserva_id");
  const valor = String(formData.get("asistio"));
  const asistio = valor === "si" ? true : valor === "no" ? false : null;

  const supabase = await createClient();
  const { error } = await supabase.rpc("marcar_asistencia", {
    p_reserva: reservaId,
    p_asistio: asistio,
  });
  if (error) console.error("marcar_asistencia:", error.message);
  refresh();
}

// Solo admin: quita a un alumno de la clase (sin límite de plazo).
export async function quitarAlumno(formData: FormData) {
  const [reservaId] = ids(formData, "reserva_id");
  const supabase = await createClient();
  const { error } = await supabase.rpc("anular_reserva", { p_reserva: reservaId });
  if (error) console.error("quitar alumno:", error.message);
  refresh();
}

// Solo admin: cancela o reactiva esta clase concreta (lluvia, festivo…).
export async function cambiarCancelacion(formData: FormData) {
  const [hipicaId, sesionId] = ids(formData, "hipica_id", "sesion_id");
  const cancelada = formData.get("cancelada") === "true";
  if (cancelada && formData.get("confirmar") !== "si") {
    redirect(`/hipica/${hipicaId}/sesion/${sesionId}?error=confirmar`);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("sesiones")
    .update({ cancelada })
    .eq("id", sesionId)
    .eq("hipica_id", hipicaId);
  if (error) console.error("cancelar sesión:", error.message);
  redirect(`/hipica/${hipicaId}/sesion/${sesionId}`);
}

// Solo admin: apunta a un alumno (con o sin cuenta, o un jinete a cargo de otro).
export async function apuntarAlumno(formData: FormData) {
  const [hipicaId, sesionId, miembroId] = ids(formData, "hipica_id", "sesion_id", "miembro_id");
  const supabase = await createClient();
  const { error } = await supabase.rpc("reservar", { p_sesion: sesionId, p_miembro: miembroId });
  if (error) {
    console.error("apuntar alumno:", error.message);
    redirect(`/hipica/${hipicaId}/sesion/${sesionId}?error=apuntar`);
  }
  refresh();
}
