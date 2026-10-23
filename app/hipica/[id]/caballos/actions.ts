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

const texto = (formData: FormData, campo: string) => String(formData.get(campo) ?? "").trim();

// Vuelve a la pantalla desde la que se pulsó (solo de esta hípica).
function volver(formData: FormData, hipicaId: string, extra?: string): never {
  const v = String(formData.get("volver") ?? "");
  const base = `/hipica/${hipicaId}`;
  const ruta = v === base || v.startsWith(`${base}/`) ? v.split("?")[0] : `${base}/caballos`;
  redirect(extra ? `${ruta}?${extra}` : ruta);
}

// Datos del formulario de un caballo (alta y edición).
function datos(formData: FormData) {
  const nombre = texto(formData, "nombre");
  const tipo = texto(formData, "tipo") === "propietario" ? "propietario" : "escuela";
  const propietario = texto(formData, "propietario_id");
  const box = texto(formData, "box");
  const pupilaje = texto(formData, "pupilaje");
  const raza = texto(formData, "raza");
  const nacimiento = texto(formData, "nacimiento");
  const max = Number(formData.get("max_clases_dia") ?? 3);
  const notas = texto(formData, "notas");
  const dieta = texto(formData, "dieta");
  const anio = nacimiento ? Number(nacimiento) : null;

  const valido =
    nombre.length >= 1 &&
    nombre.length <= 60 &&
    (!propietario || UUID.test(propietario)) &&
    box.length <= 20 &&
    (!pupilaje || ["completo", "semi", "box"].includes(pupilaje)) &&
    raza.length <= 60 &&
    (anio === null || (Number.isInteger(anio) && anio >= 1980 && anio <= 2100)) &&
    Number.isInteger(max) &&
    max >= 1 &&
    max <= 10 &&
    notas.length <= 300 &&
    dieta.length <= 500;

  return {
    valido,
    fila: {
      nombre,
      tipo,
      propietario_id: tipo === "propietario" && propietario ? propietario : null,
      box: box || null,
      pupilaje: tipo === "propietario" && pupilaje ? pupilaje : null,
      raza: raza || null,
      nacimiento: anio,
      max_clases_dia: max,
      notas: notas || null,
      dieta: dieta || null,
    },
  };
}

/* ---------- Caballos (solo admin; la base de datos lo comprueba) ---------- */

export async function crearCaballo(formData: FormData) {
  const [hipicaId] = ids(formData, "hipica_id");
  const d = datos(formData);
  if (!d.valido) redirect(`/hipica/${hipicaId}/caballos?error=datos#alta`);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("caballos")
    .insert({ hipica_id: hipicaId, ...d.fila })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) {
    console.error("crear caballo:", error?.message);
    redirect(`/hipica/${hipicaId}/caballos?error=crear#alta`);
  }
  redirect(`/hipica/${hipicaId}/caballos/${data.id}?ok=creado`);
}

export async function editarCaballo(formData: FormData) {
  const [hipicaId, caballoId] = ids(formData, "hipica_id", "caballo_id");
  const d = datos(formData);
  const ficha = `/hipica/${hipicaId}/caballos/${caballoId}`;
  if (!d.valido) redirect(`${ficha}?error=datos`);

  const supabase = await createClient();
  const { error } = await supabase.from("caballos").update(d.fila).eq("id", caballoId).eq("hipica_id", hipicaId);
  if (error) {
    console.error("editar caballo:", error.message);
    redirect(`${ficha}?error=guardar`);
  }
  redirect(`${ficha}?ok=guardado`);
}

// En reposo / disponible, o dar de baja (deja de salir en la app).
export async function cambiarEstadoCaballo(formData: FormData) {
  const [hipicaId, caballoId] = ids(formData, "hipica_id", "caballo_id");
  const campo = texto(formData, "campo");
  const valor = formData.get("valor") === "true";
  if (!["disponible", "activo"].includes(campo)) redirect("/");

  const supabase = await createClient();
  const { error } = await supabase
    .from("caballos")
    .update({ [campo]: valor })
    .eq("id", caballoId)
    .eq("hipica_id", hipicaId);
  if (error) console.error("estado caballo:", error.message);
  if (campo === "activo" && !valor) redirect(`/hipica/${hipicaId}/caballos?ok=baja`);
  refresh();
}

/* ---------- Día a día (admin o monitor) ---------- */

export async function moverCaballo(formData: FormData) {
  const [, caballoId] = ids(formData, "hipica_id", "caballo_id");
  const ubicacion = texto(formData, "ubicacion");
  const supabase = await createClient();
  const { error } = await supabase.rpc("mover_caballo", { p_caballo: caballoId, p_ubicacion: ubicacion });
  if (error) console.error("mover caballo:", error.message);
  refresh();
}

const TIPOS = ["herrador", "vacuna", "desparasitacion", "dentista", "veterinario", "otro"];

export async function crearCuidado(formData: FormData) {
  const [hipicaId, caballoId] = ids(formData, "hipica_id", "caballo_id");
  const tipo = texto(formData, "tipo");
  const fecha = texto(formData, "fecha");
  const nota = texto(formData, "nota");
  const ficha = `/hipica/${hipicaId}/caballos/${caballoId}`;
  if (!TIPOS.includes(tipo) || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || nota.length > 300) redirect(`${ficha}?error=cuidado`);

  const supabase = await createClient();
  const { error } = await supabase
    .from("cuidados")
    .insert({ hipica_id: hipicaId, caballo_id: caballoId, tipo, fecha, nota: nota || null });
  avisar();
  if (error) {
    console.error("crear cuidado:", error.message);
    redirect(`${ficha}?error=cuidado`);
  }
  redirect(`${ficha}?ok=cuidado`);
}

export async function cuidadoHecho(formData: FormData) {
  const [hipicaId, cuidadoId] = ids(formData, "hipica_id", "cuidado_id");
  const nota = texto(formData, "nota");
  const supabase = await createClient();
  const { error } = await supabase.rpc("cuidado_hecho", { p_cuidado: cuidadoId, p_nota: nota || null });
  avisar();
  if (error) {
    console.error("cuidado hecho:", error.message);
    volver(formData, hipicaId, "error=cuidado");
  }
  refresh();
}

export async function borrarCuidado(formData: FormData) {
  const [hipicaId, cuidadoId] = ids(formData, "hipica_id", "cuidado_id");
  const supabase = await createClient();
  const { error } = await supabase.from("cuidados").delete().eq("id", cuidadoId).eq("hipica_id", hipicaId);
  if (error) console.error("borrar cuidado:", error.message);
  refresh();
}

/* ---------- Propietario ---------- */

// "Que se encargue la hípica" / "Me encargo yo".
export async function responderCuidado(formData: FormData) {
  const [hipicaId, cuidadoId] = ids(formData, "hipica_id", "cuidado_id");
  const responsable = texto(formData, "responsable");
  const supabase = await createClient();
  const { error } = await supabase.rpc("responder_cuidado", { p_cuidado: cuidadoId, p_responsable: responsable });
  if (error) {
    console.error("responder cuidado:", error.message);
    volver(formData, hipicaId, "aviso=error");
  }
  refresh();
}
