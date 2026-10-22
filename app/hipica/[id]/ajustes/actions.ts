"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
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
  const exigirBono = formData.get("exigir_bono") === "si";
  const revisarAltas = formData.get("revisar_altas") === "si";
  const boxes = Number(formData.get("num_boxes") || 0);

  if (
    nombre.length < 2 ||
    nombre.length > 120 ||
    !PLAZOS.includes(horas) ||
    !(semanas >= 1 && semanas <= 8) ||
    !Number.isInteger(boxes) ||
    boxes < 0 ||
    boxes > 300
  ) {
    redirect(`/hipica/${hipicaId}/ajustes?error=datos`);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("hipicas")
    .update({
      nombre,
      horas_minimas_anulacion: horas,
      calendario_auto: auto,
      semanas_auto: semanas,
      exigir_bono: exigirBono,
      revisar_altas: revisarAltas,
      num_boxes: boxes,
    })
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

export async function crearPista(formData: FormData) {
  const hipicaId = String(formData.get("hipica_id") ?? "");
  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!UUID.test(hipicaId)) redirect("/");
  if (nombre.length < 1 || nombre.length > 60) redirect(`/hipica/${hipicaId}/ajustes?error=pista`);

  const supabase = await createClient();
  const { count } = await supabase.from("pistas").select("id", { count: "exact", head: true }).eq("hipica_id", hipicaId);
  const { error } = await supabase.from("pistas").insert({ hipica_id: hipicaId, nombre, orden: (count ?? 0) + 1 });
  if (error) {
    console.error("crear pista:", error.message);
    redirect(`/hipica/${hipicaId}/ajustes?error=pista`);
  }
  redirect(`/hipica/${hipicaId}/ajustes?ok=pista#pistas`);
}

export async function cambiarPista(formData: FormData) {
  const hipicaId = String(formData.get("hipica_id") ?? "");
  const pistaId = String(formData.get("pista_id") ?? "");
  if (!UUID.test(hipicaId) || !UUID.test(pistaId)) redirect("/");
  const activa = formData.get("activa") === "true";

  const supabase = await createClient();
  const { error } = await supabase.from("pistas").update({ activa }).eq("id", pistaId).eq("hipica_id", hipicaId);
  if (error) console.error("cambiar pista:", error.message);
  refresh();
}

/* ---------- Servicios para propietarios ---------- */

export async function crearServicio(formData: FormData) {
  const hipicaId = String(formData.get("hipica_id") ?? "");
  if (!UUID.test(hipicaId)) redirect("/");
  const nombre = String(formData.get("nombre") ?? "").trim();
  const descripcion = String(formData.get("descripcion") ?? "").trim();
  const precioTexto = String(formData.get("precio") ?? "").trim().replace(",", ".");
  const precio = precioTexto === "" ? null : Number(precioTexto);
  if (
    nombre.length < 1 ||
    nombre.length > 60 ||
    descripcion.length > 120 ||
    (precio !== null && (!Number.isFinite(precio) || precio < 0 || precio > 10000))
  ) {
    redirect(`/hipica/${hipicaId}/ajustes?error=servicio#servicios`);
  }

  const supabase = await createClient();
  const { count } = await supabase.from("servicios").select("id", { count: "exact", head: true }).eq("hipica_id", hipicaId);
  const { error } = await supabase
    .from("servicios")
    .insert({ hipica_id: hipicaId, nombre, descripcion: descripcion || null, precio, orden: (count ?? 0) + 1 });
  if (error) {
    console.error("crear servicio:", error.message);
    redirect(`/hipica/${hipicaId}/ajustes?error=servicio#servicios`);
  }
  redirect(`/hipica/${hipicaId}/ajustes?ok=servicio#servicios`);
}

export async function borrarServicio(formData: FormData) {
  const hipicaId = String(formData.get("hipica_id") ?? "");
  const servicioId = String(formData.get("servicio_id") ?? "");
  if (!UUID.test(hipicaId) || !UUID.test(servicioId)) redirect("/");
  const supabase = await createClient();
  // Las solicitudes ya hechas guardan su copia del servicio y su precio.
  const { error } = await supabase.from("servicios").delete().eq("id", servicioId).eq("hipica_id", hipicaId);
  if (error) console.error("borrar servicio:", error.message);
  refresh();
}

export async function serviciosTipicos(formData: FormData) {
  const hipicaId = String(formData.get("hipica_id") ?? "");
  if (!UUID.test(hipicaId)) redirect("/");
  const supabase = await createClient();
  const { error } = await supabase.rpc("servicios_tipicos", { p_hipica: hipicaId });
  if (error) console.error("servicios típicos:", error.message);
  redirect(`/hipica/${hipicaId}/ajustes?ok=servicio#servicios`);
}

/* ---------- Tarifas y pagos ---------- */

const precio = (formData: FormData, campo: string) => {
  const t = String(formData.get(campo) ?? "").trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= 100000 ? Math.round(n * 100) / 100 : NaN;
};

export async function guardarTarifas(formData: FormData) {
  const hipicaId = String(formData.get("hipica_id") ?? "");
  if (!UUID.test(hipicaId)) redirect("/");
  const completo = precio(formData, "precio_completo");
  const semi = precio(formData, "precio_semi");
  const box = precio(formData, "precio_box");
  const instrucciones = String(formData.get("instrucciones_pago") ?? "").trim();
  if ([completo, semi, box].some((n) => Number.isNaN(n)) || instrucciones.length > 500) {
    redirect(`/hipica/${hipicaId}/ajustes?error=tarifas#tarifas`);
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("hipicas")
    .update({ precio_completo: completo, precio_semi: semi, precio_box: box, instrucciones_pago: instrucciones || null })
    .eq("id", hipicaId);
  if (error) {
    console.error("guardar tarifas:", error.message);
    redirect(`/hipica/${hipicaId}/ajustes?error=tarifas#tarifas`);
  }
  redirect(`/hipica/${hipicaId}/ajustes?ok=tarifas#tarifas`);
}

export async function guardarTarifaBono(formData: FormData) {
  const hipicaId = String(formData.get("hipica_id") ?? "");
  if (!UUID.test(hipicaId)) redirect("/");
  const clases = Number(formData.get("clases"));
  const p = precio(formData, "precio");
  if (!Number.isInteger(clases) || clases < 1 || clases > 100 || p === null || Number.isNaN(p)) {
    redirect(`/hipica/${hipicaId}/ajustes?error=tarifas#tarifas`);
  }
  const supabase = await createClient();
  const { error } = await supabase.from("tarifas_bonos").upsert({ hipica_id: hipicaId, clases, precio: p });
  if (error) {
    console.error("tarifa bono:", error.message);
    redirect(`/hipica/${hipicaId}/ajustes?error=tarifas#tarifas`);
  }
  redirect(`/hipica/${hipicaId}/ajustes?ok=tarifas#tarifas`);
}

export async function borrarTarifaBono(formData: FormData) {
  const hipicaId = String(formData.get("hipica_id") ?? "");
  const clases = Number(formData.get("clases"));
  if (!UUID.test(hipicaId) || !Number.isInteger(clases)) redirect("/");
  const supabase = await createClient();
  const { error } = await supabase.from("tarifas_bonos").delete().eq("hipica_id", hipicaId).eq("clases", clases);
  if (error) console.error("borrar tarifa bono:", error.message);
  refresh();
}
