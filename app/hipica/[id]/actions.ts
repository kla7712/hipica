"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UUID } from "@/lib/rutas";

// Mensajes de la base de datos que se pueden enseñar tal cual al alumno.
const MENSAJES_CONOCIDOS = [
  "No quedan plazas",
  "Ya tienes plaza en esta clase",
  "La clase está cancelada",
  "La clase ya ha empezado",
  "Ya no se puede anular",
  "No puedes anular esta reserva",
];

function volver(hipicaId: string, mensaje?: string): never {
  const aviso = mensaje && MENSAJES_CONOCIDOS.find((m) => mensaje.startsWith(m)) ? mensaje : mensaje ? "Algo ha fallado. Vuelve a intentarlo." : null;
  redirect(`/hipica/${hipicaId}${aviso ? `?aviso=${encodeURIComponent(aviso)}` : ""}`);
}

export async function reservar(formData: FormData) {
  const hipicaId = String(formData.get("hipica_id") ?? "");
  const sesionId = String(formData.get("sesion_id") ?? "");
  if (!UUID.test(hipicaId) || !UUID.test(sesionId)) redirect("/");

  const supabase = await createClient();
  const { error } = await supabase.rpc("reservar", { p_sesion: sesionId });
  if (error) volver(hipicaId, error.message);
  volver(hipicaId);
}

export async function anular(formData: FormData) {
  const hipicaId = String(formData.get("hipica_id") ?? "");
  const reservaId = String(formData.get("reserva_id") ?? "");
  if (!UUID.test(hipicaId) || !UUID.test(reservaId)) redirect("/");

  const supabase = await createClient();
  const { error } = await supabase.rpc("anular_reserva", { p_reserva: reservaId });
  if (error) volver(hipicaId, error.message);
  volver(hipicaId);
}
