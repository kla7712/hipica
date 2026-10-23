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

// Todo bien: recarga. Si la pantalla mostraba un error, vuelve a la URL limpia.
function hecho(formData: FormData) {
  const hipicaId = String(formData.get("hipica_id") ?? "");
  const sesionId = String(formData.get("sesion_id") ?? "");
  if (formData.get("limpiar") === "1" && UUID.test(hipicaId) && UUID.test(sesionId)) {
    redirect(`/hipica/${hipicaId}/sesion/${sesionId}`);
  }
  refresh();
}

const conError = (hipicaId: string, sesionId: string, codigo: string): never =>
  redirect(`/hipica/${hipicaId}/sesion/${sesionId}?error=${codigo}`);

// Monitor o admin: marca si el alumno vino (true), no vino (false) o lo deja sin marcar.
export async function marcarAsistencia(formData: FormData) {
  const [reservaId] = ids(formData, "reserva_id");
  const valor = String(formData.get("asistio"));
  const asistio = valor === "si" ? true : valor === "no" ? false : null;

  const supabase = await createClient();
  const { error } = await supabase.rpc("marcar_asistencia", { p_reserva: reservaId, p_asistio: asistio });
  if (error) console.error("marcar_asistencia:", error.message);
  hecho(formData);
}

// Monitor o admin: asigna (o quita) el caballo de un jinete en esta clase.
export async function asignarCaballo(formData: FormData) {
  const [hipicaId, sesionId, reservaId] = ids(formData, "hipica_id", "sesion_id", "reserva_id");
  const caballo = String(formData.get("caballo_id") ?? "");
  if (caballo && !UUID.test(caballo)) redirect("/");

  const supabase = await createClient();
  const { error } = await supabase.rpc("asignar_caballo", { p_reserva: reservaId, p_caballo: caballo || null });
  if (error) {
    console.error("asignar_caballo:", error.message);
    conError(hipicaId, sesionId, error.message.includes("ya está") ? "caballo_repetido" : "caballo");
  }
  hecho(formData);
}

// Solo admin: quita a un alumno de la clase (sin límite de plazo). Si hay
// lista de espera, entra el primero.
export async function quitarAlumno(formData: FormData) {
  const [reservaId] = ids(formData, "reserva_id");
  const supabase = await createClient();
  const { error } = await supabase.rpc("anular_reserva", { p_reserva: reservaId });
  avisar();
  if (error) console.error("quitar alumno:", error.message);
  hecho(formData);
}

// Solo admin: cancela o reactiva esta clase concreta (lluvia, festivo…).
export async function cambiarCancelacion(formData: FormData) {
  const [hipicaId, sesionId] = ids(formData, "hipica_id", "sesion_id");
  const cancelada = formData.get("cancelada") === "true";
  if (cancelada && formData.get("confirmar") !== "si") conError(hipicaId, sesionId, "confirmar");

  const supabase = await createClient();
  const { error } = await supabase.from("sesiones").update({ cancelada }).eq("id", sesionId).eq("hipica_id", hipicaId);
  avisar();
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
    conError(hipicaId, sesionId, "apuntar");
  }
  hecho(formData);
}

// Solo admin: apunta a alguien a la lista de espera de una clase completa.
export async function apuntarEspera(formData: FormData) {
  const [hipicaId, sesionId, miembroId] = ids(formData, "hipica_id", "sesion_id", "miembro_id");
  const supabase = await createClient();
  const { error } = await supabase.rpc("apuntarse_espera", { p_sesion: sesionId, p_miembro: miembroId });
  if (error) {
    console.error("apuntar a la espera:", error.message);
    conError(hipicaId, sesionId, "espera");
  }
  hecho(formData);
}

// Solo admin: quita a alguien de la lista de espera.
export async function quitarEspera(formData: FormData) {
  const [esperaId] = ids(formData, "espera_id");
  const supabase = await createClient();
  const { error } = await supabase.rpc("salir_espera", { p_espera: esperaId });
  if (error) console.error("quitar de la espera:", error.message);
  hecho(formData);
}
