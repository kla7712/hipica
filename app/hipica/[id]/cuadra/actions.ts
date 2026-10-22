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
const texto = (formData: FormData, campo: string) => String(formData.get(campo) ?? "").trim();
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/* ---------- Tareas ---------- */

export async function marcarTarea(formData: FormData) {
  const [, tareaId] = ids(formData, "hipica_id", "tarea_id");
  const fecha = texto(formData, "fecha");
  if (!FECHA.test(fecha)) redirect("/");
  const supabase = await createClient();
  const { error } = await supabase.rpc("marcar_tarea", {
    p_tarea: tareaId,
    p_fecha: fecha,
    p_hecha: formData.get("hecha") === "true",
  });
  if (error) console.error("marcar tarea:", error.message);
  refresh();
}

export async function crearTarea(formData: FormData) {
  const [hipicaId] = ids(formData, "hipica_id");
  const titulo = texto(formData, "titulo");
  const detalle = texto(formData, "detalle");
  const turno = texto(formData, "turno") === "tarde" ? "tarde" : "manana";
  const hora = texto(formData, "hora");
  const cuando = texto(formData, "cuando");
  const hoy = texto(formData, "hoy");
  const responsable = texto(formData, "responsable_id");
  const dias = formData
    .getAll("dias")
    .map(Number)
    .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7);
  const aqui = `/hipica/${hipicaId}/cuadra?turno=${turno}`;

  if (
    titulo.length < 1 ||
    titulo.length > 80 ||
    detalle.length > 160 ||
    (hora && !/^\d{2}:\d{2}$/.test(hora)) ||
    (responsable && !UUID.test(responsable)) ||
    !FECHA.test(hoy) ||
    (cuando === "dias" && dias.length === 0)
  ) {
    redirect(`${aqui}&error=tarea`);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("tareas").insert({
    hipica_id: hipicaId,
    titulo,
    detalle: detalle || null,
    turno,
    hora: hora || null,
    fecha: cuando === "hoy" ? hoy : null,
    dias: cuando === "dias" ? [...new Set(dias)].sort() : [1, 2, 3, 4, 5, 6, 7],
    responsable_id: responsable || null,
  });
  if (error) {
    console.error("crear tarea:", error.message);
    redirect(`${aqui}&error=tarea`);
  }
  redirect(`${aqui}&ok=tarea`);
}

export async function borrarTarea(formData: FormData) {
  const [hipicaId, tareaId] = ids(formData, "hipica_id", "tarea_id");
  const supabase = await createClient();
  const { error } = await supabase.from("tareas").delete().eq("id", tareaId).eq("hipica_id", hipicaId);
  if (error) console.error("borrar tarea:", error.message);
  refresh();
}

/* ---------- Almacén ---------- */

export async function ajustarExistencia(formData: FormData) {
  const [, existenciaId] = ids(formData, "hipica_id", "existencia_id");
  const cambio = Number(String(formData.get("cambio") ?? "").replace(",", "."));
  if (!Number.isFinite(cambio) || cambio === 0 || Math.abs(cambio) > 1000) redirect("/");
  const supabase = await createClient();
  const { error } = await supabase.rpc("ajustar_existencia", { p_existencia: existenciaId, p_cambio: cambio });
  if (error) console.error("ajustar existencia:", error.message);
  refresh();
}

export async function marcarPedido(formData: FormData) {
  const [, existenciaId] = ids(formData, "hipica_id", "existencia_id");
  const supabase = await createClient();
  const { error } = await supabase.rpc("marcar_pedido", {
    p_existencia: existenciaId,
    p_pedido: formData.get("pedido") === "true",
  });
  if (error) console.error("marcar pedido:", error.message);
  refresh();
}

// Solo admin (la base de datos lo comprueba).
export async function crearExistencia(formData: FormData) {
  const [hipicaId] = ids(formData, "hipica_id");
  const num = (campo: string) => {
    const t = texto(formData, campo).replace(",", ".");
    return t === "" ? null : Number(t);
  };
  const nombre = texto(formData, "nombre");
  const unidad = texto(formData, "unidad") || "sacos";
  const cantidad = num("cantidad") ?? 0;
  const minimo = num("minimo") ?? 0;
  const consumo = num("consumo_dia");
  const proveedor = texto(formData, "proveedor");
  const telefono = texto(formData, "proveedor_tel");
  const aqui = `/hipica/${hipicaId}/cuadra`;
  const valido =
    nombre.length >= 1 &&
    nombre.length <= 40 &&
    unidad.length <= 20 &&
    [cantidad, minimo].every((n) => Number.isFinite(n) && n >= 0 && n <= 100000) &&
    (consumo === null || (Number.isFinite(consumo) && consumo > 0 && consumo < 10000)) &&
    proveedor.length <= 60 &&
    telefono.length <= 30;
  if (!valido) redirect(`${aqui}?error=almacen#almacen`);

  const supabase = await createClient();
  const { error } = await supabase.from("existencias").insert({
    hipica_id: hipicaId,
    nombre,
    unidad,
    cantidad,
    minimo,
    consumo_dia: consumo,
    proveedor: proveedor || null,
    proveedor_tel: telefono || null,
  });
  if (error) {
    console.error("crear existencia:", error.message);
    redirect(`${aqui}?error=almacen#almacen`);
  }
  redirect(`${aqui}?ok=almacen#almacen`);
}

export async function borrarExistencia(formData: FormData) {
  const [hipicaId, existenciaId] = ids(formData, "hipica_id", "existencia_id");
  const supabase = await createClient();
  const { error } = await supabase.from("existencias").delete().eq("id", existenciaId).eq("hipica_id", hipicaId);
  if (error) console.error("borrar existencia:", error.message);
  refresh();
}
