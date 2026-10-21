"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { UUID } from "@/lib/rutas";

function datos(formData: FormData) {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const max = Number(formData.get("max_clases_dia"));
  const notas = String(formData.get("notas") ?? "").trim();
  const valido = nombre.length >= 1 && nombre.length <= 60 && Number.isInteger(max) && max >= 1 && max <= 10 && notas.length <= 300;
  return { valido, nombre, max_clases_dia: max, notas: notas || null };
}

// Solo admin (la base de datos lo comprueba).
export async function crearCaballo(formData: FormData) {
  const hipicaId = String(formData.get("hipica_id") ?? "");
  if (!UUID.test(hipicaId)) redirect("/");
  const d = datos(formData);
  if (!d.valido) redirect(`/hipica/${hipicaId}/caballos?error=datos`);

  const supabase = await createClient();
  const { error } = await supabase.from("caballos").insert({
    hipica_id: hipicaId,
    nombre: d.nombre,
    max_clases_dia: d.max_clases_dia,
    notas: d.notas,
  });
  if (error) {
    console.error("crear caballo:", error.message);
    redirect(`/hipica/${hipicaId}/caballos?error=crear`);
  }
  redirect(`/hipica/${hipicaId}/caballos?ok=creado`);
}

export async function editarCaballo(formData: FormData) {
  const hipicaId = String(formData.get("hipica_id") ?? "");
  const caballoId = String(formData.get("caballo_id") ?? "");
  if (!UUID.test(hipicaId) || !UUID.test(caballoId)) redirect("/");
  const d = datos(formData);
  if (!d.valido) redirect(`/hipica/${hipicaId}/caballos?error=datos`);

  const supabase = await createClient();
  const { error } = await supabase
    .from("caballos")
    .update({ nombre: d.nombre, max_clases_dia: d.max_clases_dia, notas: d.notas })
    .eq("id", caballoId)
    .eq("hipica_id", hipicaId);
  if (error) {
    console.error("editar caballo:", error.message);
    redirect(`/hipica/${hipicaId}/caballos?error=guardar`);
  }
  redirect(`/hipica/${hipicaId}/caballos?ok=guardado`);
}

// En reposo / disponible, o dar de baja (deja de salir en la app).
export async function cambiarEstadoCaballo(formData: FormData) {
  const hipicaId = String(formData.get("hipica_id") ?? "");
  const caballoId = String(formData.get("caballo_id") ?? "");
  const campo = String(formData.get("campo") ?? "");
  const valor = formData.get("valor") === "true";
  if (!UUID.test(hipicaId) || !UUID.test(caballoId) || !["disponible", "activo"].includes(campo)) redirect("/");

  const supabase = await createClient();
  const { error } = await supabase
    .from("caballos")
    .update({ [campo]: valor })
    .eq("id", caballoId)
    .eq("hipica_id", hipicaId);
  if (error) console.error("estado caballo:", error.message);
  refresh();
}
