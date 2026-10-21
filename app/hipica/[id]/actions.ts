"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
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
  ["No puedes reservar para esta persona", "persona"],
  ["No te quedan clases en el bono", "bono"],
  ["Aún quedan plazas", "quedan"],
  ["Ya estás en la lista de espera", "yaespera"],
  ["La lista de espera está llena", "esperallena"],
];

// Vuelve a la pantalla desde la que se pulsó (solo pantallas de esta hípica).
function destino(formData: FormData, hipicaId: string) {
  const v = String(formData.get("volver") ?? "");
  const base = `/hipica/${hipicaId}`;
  return v === base || v.startsWith(`${base}/`) || v.startsWith(`${base}?`) ? v : base;
}

function conAviso(ruta: string, mensaje: string): never {
  const codigo = CODIGOS.find(([m]) => mensaje.startsWith(m))?.[1] ?? "error";
  const url = new URL(ruta, "http://x");
  url.searchParams.set("aviso", codigo);
  redirect(`${url.pathname}${url.search}`);
}

// Todo bien: recarga la pantalla. Si arrastraba un aviso de error, lo quita.
function listo(formData: FormData, hipicaId: string) {
  const url = new URL(destino(formData, hipicaId), "http://x");
  if (url.searchParams.has("aviso")) {
    url.searchParams.delete("aviso");
    redirect(`${url.pathname}${url.search}`);
  }
  refresh();
}

function leer(formData: FormData, ...campos: string[]) {
  const valores = campos.map((c) => String(formData.get(c) ?? ""));
  if (!valores.every((v) => UUID.test(v))) redirect("/");
  return valores;
}

export async function reservar(formData: FormData) {
  const [hipicaId, sesionId] = leer(formData, "hipica_id", "sesion_id");
  const miembroId = String(formData.get("miembro_id") ?? "");
  if (miembroId && !UUID.test(miembroId)) redirect("/");

  const supabase = await createClient();
  const { error } = await supabase.rpc("reservar", {
    p_sesion: sesionId,
    ...(miembroId ? { p_miembro: miembroId } : {}),
  });
  if (error) conAviso(destino(formData, hipicaId), error.message);
  listo(formData, hipicaId);
}

export async function anular(formData: FormData) {
  const [hipicaId, reservaId] = leer(formData, "hipica_id", "reserva_id");
  const supabase = await createClient();
  const { error } = await supabase.rpc("anular_reserva", { p_reserva: reservaId });
  if (error) conAviso(destino(formData, hipicaId), error.message);
  listo(formData, hipicaId);
}

export async function apuntarseEspera(formData: FormData) {
  const [hipicaId, sesionId] = leer(formData, "hipica_id", "sesion_id");
  const miembroId = String(formData.get("miembro_id") ?? "");
  if (miembroId && !UUID.test(miembroId)) redirect("/");

  const supabase = await createClient();
  const { error } = await supabase.rpc("apuntarse_espera", {
    p_sesion: sesionId,
    ...(miembroId ? { p_miembro: miembroId } : {}),
  });
  if (error) conAviso(destino(formData, hipicaId), error.message);
  listo(formData, hipicaId);
}

export async function salirEspera(formData: FormData) {
  const [hipicaId, esperaId] = leer(formData, "hipica_id", "espera_id");
  const supabase = await createClient();
  const { error } = await supabase.rpc("salir_espera", { p_espera: esperaId });
  if (error) conAviso(destino(formData, hipicaId), error.message);
  listo(formData, hipicaId);
}

// Tablón (solo admin; la base de datos lo comprueba).
export async function publicarAviso(formData: FormData) {
  const [hipicaId] = leer(formData, "hipica_id");
  const texto = String(formData.get("texto") ?? "").trim();
  if (texto.length < 1 || texto.length > 1000) conAviso(destino(formData, hipicaId), "texto");

  const supabase = await createClient();
  const { error } = await supabase.from("avisos").insert({ hipica_id: hipicaId, texto });
  if (error) {
    console.error("publicar aviso:", error.message);
    conAviso(destino(formData, hipicaId), "error");
  }
  listo(formData, hipicaId);
}

export async function borrarAviso(formData: FormData) {
  const [hipicaId, avisoId] = leer(formData, "hipica_id", "aviso_id");
  const supabase = await createClient();
  const { error } = await supabase.from("avisos").delete().eq("id", avisoId).eq("hipica_id", hipicaId);
  if (error) console.error("borrar aviso:", error.message);
  refresh();
}
