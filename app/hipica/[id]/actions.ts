"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UUID } from "@/lib/rutas";

// La URL solo lleva un código; el texto lo pone la página (evita que alguien
// fabrique enlaces con mensajes falsos, p. ej. "llama a este teléfono").
const CODIGOS: [string, string][] = [
  ["No quedan plazas", "completa"],
  ["Ya tienes plaza en esta clase", "repetida"],
  ["La clase está cancelada", "cancelada"],
  ["La clase ya ha empezado", "empezada"],
  ["Ya no se puede anular", "plazo"],
  ["No puedes anular esta reserva", "ajena"],
];

function volver(hipicaId: string, mensaje?: string): never {
  const codigo = mensaje ? (CODIGOS.find(([m]) => mensaje.startsWith(m))?.[1] ?? "error") : null;
  redirect(`/hipica/${hipicaId}${codigo ? `?aviso=${codigo}` : ""}`);
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
