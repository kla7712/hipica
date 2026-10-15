"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f-]{36}$/i;

function volver(hipicaId: string, query: string): never {
  redirect(`/hipica/${hipicaId}/clases?${query}`);
}

export async function crearClase(formData: FormData) {
  const hipicaId = String(formData.get("hipica_id") ?? "");
  if (!UUID.test(hipicaId)) redirect("/");

  const titulo = String(formData.get("titulo") ?? "").trim();
  const nivel = String(formData.get("nivel") ?? "").trim() || null;
  const monitorId = String(formData.get("monitor_id") ?? "") || null;
  const diaSemana = Number(formData.get("dia_semana"));
  const horaInicio = String(formData.get("hora_inicio") ?? "");
  const duracionMin = Number(formData.get("duracion_min"));
  const plazas = Number(formData.get("plazas"));

  const valido =
    titulo.length >= 1 &&
    titulo.length <= 120 &&
    Number.isInteger(diaSemana) && diaSemana >= 1 && diaSemana <= 7 &&
    /^\d{2}:\d{2}$/.test(horaInicio) &&
    Number.isInteger(duracionMin) && duracionMin >= 15 && duracionMin <= 480 &&
    Number.isInteger(plazas) && plazas >= 1 && plazas <= 100 &&
    (monitorId === null || UUID.test(monitorId));
  if (!valido) volver(hipicaId, "error=datos");

  const supabase = await createClient();
  const { error } = await supabase.from("clases").insert({
    hipica_id: hipicaId,
    titulo,
    nivel,
    monitor_id: monitorId,
    dia_semana: diaSemana,
    hora_inicio: horaInicio,
    duracion_min: duracionMin,
    plazas,
  });

  if (error) {
    console.error("crear clase:", error.message);
    volver(hipicaId, "error=crear");
  }
  volver(hipicaId, "ok=creada");
}

export async function cambiarEstadoClase(formData: FormData) {
  const hipicaId = String(formData.get("hipica_id") ?? "");
  const claseId = String(formData.get("clase_id") ?? "");
  const activa = formData.get("activa") === "true";
  if (!UUID.test(hipicaId) || !UUID.test(claseId)) redirect("/");

  const supabase = await createClient();
  const { error } = await supabase
    .from("clases")
    .update({ activa })
    .eq("id", claseId)
    .eq("hipica_id", hipicaId);

  if (error) console.error("cambiar estado clase:", error.message);
  refresh();
}

export async function generarCalendario(formData: FormData) {
  const hipicaId = String(formData.get("hipica_id") ?? "");
  const semanas = Number(formData.get("semanas"));
  if (!UUID.test(hipicaId) || ![2, 4, 8].includes(semanas)) redirect("/");

  const hasta = new Date(Date.now() + semanas * 7 * 864e5).toISOString().slice(0, 10);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("generar_sesiones", {
    p_hipica: hipicaId,
    p_hasta: hasta,
  });

  if (error) {
    console.error("generar_sesiones:", error.message);
    volver(hipicaId, "error=generar");
  }
  volver(hipicaId, `generadas=${Number(data) || 0}&semanas=${semanas}`);
}
