"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UUID } from "@/lib/rutas";

const PLAZOS = [0, 2, 6, 12, 24, 48];

export async function guardarAjustes(formData: FormData) {
  const hipicaId = String(formData.get("hipica_id") ?? "");
  if (!UUID.test(hipicaId)) redirect("/");

  const nombre = String(formData.get("nombre") ?? "").trim();
  const horas = Number(formData.get("horas"));
  const auto = formData.get("calendario_auto") === "si";
  const semanas = Number(formData.get("semanas"));

  if (nombre.length < 2 || nombre.length > 120 || !PLAZOS.includes(horas) || !(semanas >= 1 && semanas <= 8)) {
    redirect(`/hipica/${hipicaId}/ajustes?error=datos`);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("hipicas")
    .update({ nombre, horas_minimas_anulacion: horas, calendario_auto: auto, semanas_auto: semanas })
    .eq("id", hipicaId);
  if (error) {
    console.error("guardar ajustes:", error.message);
    redirect(`/hipica/${hipicaId}/ajustes?error=guardar`);
  }

  // Con el calendario automático activado, publica ya lo que falte.
  if (auto) {
    const hasta = new Date(Date.now() + semanas * 7 * 864e5).toISOString().slice(0, 10);
    await supabase.rpc("generar_sesiones", { p_hipica: hipicaId, p_hasta: hasta });
  }
  redirect(`/hipica/${hipicaId}/ajustes?ok=guardado`);
}
