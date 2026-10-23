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

export async function crearInvitacion(formData: FormData) {
  const [hipicaId] = ids(formData, "hipica_id");
  const rol = String(formData.get("rol") ?? "");
  if (!["alumno", "monitor"].includes(rol)) redirect("/");

  // Alumnos: un enlace que vale para todos durante 30 días.
  // Monitor: un enlace de un solo uso que caduca en 7 días.
  const dias = rol === "alumno" ? 30 : 7;
  const supabase = await createClient();
  const { error } = await supabase.from("invitaciones").insert({
    hipica_id: hipicaId,
    rol,
    usos_max: rol === "alumno" ? null : 1,
    expira_en: new Date(Date.now() + dias * 864e5).toISOString(),
  });
  if (error) {
    console.error("crear invitación:", error.message);
    redirect(`/hipica/${hipicaId}/miembros?error=invitar`);
  }
  refresh();
}

export async function borrarInvitacion(formData: FormData) {
  const [hipicaId, invitacionId] = ids(formData, "hipica_id", "invitacion_id");
  const supabase = await createClient();
  const { error } = await supabase.from("invitaciones").delete().eq("id", invitacionId).eq("hipica_id", hipicaId);
  if (error) console.error("borrar invitación:", error.message);
  refresh();
}

// Solo admin: da de baja a un miembro (deja de ver la hípica y se anulan sus reservas futuras).
export async function darDeBaja(formData: FormData) {
  const [hipicaId, miembroId] = ids(formData, "hipica_id", "miembro_id");
  const supabase = await createClient();
  const { error } = await supabase.rpc("dar_de_baja", { p_miembro: miembroId });
  avisar();
  if (error) {
    console.error("dar_de_baja:", error.message);
    redirect(`/hipica/${hipicaId}/miembros?error=baja`);
  }
  redirect(`/hipica/${hipicaId}/miembros?ok=baja`);
}

// Solo admin: alumno sin cuenta (reserva por teléfono, no usa el móvil…).
export async function anadirSinCuenta(formData: FormData) {
  const [hipicaId] = ids(formData, "hipica_id");
  const nombre = String(formData.get("nombre") ?? "").trim();
  const telefono = String(formData.get("telefono") ?? "").trim();
  if (nombre.length < 1 || nombre.length > 120 || telefono.length > 30) {
    redirect(`/hipica/${hipicaId}/miembros?error=sincuenta`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("anadir_alumno_sin_cuenta", {
    p_hipica: hipicaId,
    p_nombre: nombre,
    p_telefono: telefono,
  });
  if (error || typeof data !== "string") {
    console.error("anadir_alumno_sin_cuenta:", error?.message);
    redirect(`/hipica/${hipicaId}/miembros?error=sincuenta`);
  }
  redirect(`/hipica/${hipicaId}/miembros/${data}?ok=creado`);
}

/* ---------- Ficha del alumno ---------- */

const ficha = (hipicaId: string, miembroId: string, q: string): never =>
  redirect(`/hipica/${hipicaId}/miembros/${miembroId}?${q}`);

// Admin o monitor.
export async function cambiarNivel(formData: FormData) {
  const [hipicaId, miembroId] = ids(formData, "hipica_id", "miembro_id");
  const nivel = String(formData.get("nivel") ?? "").trim();
  if (nivel.length > 40) ficha(hipicaId, miembroId, "error=nivel");

  const supabase = await createClient();
  const { error } = await supabase
    .from("miembros")
    .update({ nivel: nivel || null })
    .eq("id", miembroId)
    .eq("hipica_id", hipicaId);
  if (error) {
    console.error("cambiar nivel:", error.message);
    ficha(hipicaId, miembroId, "error=nivel");
  }
  ficha(hipicaId, miembroId, "ok=nivel");
}

// Solo admin.
export async function editarDatos(formData: FormData) {
  const [hipicaId, miembroId] = ids(formData, "hipica_id", "miembro_id");
  const nombre = String(formData.get("nombre") ?? "").trim();
  const telefono = String(formData.get("telefono") ?? "").trim();
  const factura = String(formData.get("datos_factura") ?? "").trim();
  if (nombre.length < 1 || nombre.length > 120 || telefono.length > 30 || factura.length > 300) ficha(hipicaId, miembroId, "error=datos");

  const supabase = await createClient();
  const { error } = await supabase
    .from("miembros")
    .update({ nombre, telefono: telefono || null, datos_factura: factura || null })
    .eq("id", miembroId)
    .eq("hipica_id", hipicaId);
  if (error) {
    console.error("editar datos:", error.message);
    ficha(hipicaId, miembroId, "error=datos");
  }
  ficha(hipicaId, miembroId, "ok=datos");
}

const CLASES = [1, 4, 5, 8, 10, 12, 16, 20];
const MESES = [0, 1, 2, 3, 6, 12];

// Solo admin: bono de N clases (normalmente al cobrarlo en recepción).
export async function crearBono(formData: FormData) {
  const [hipicaId, miembroId] = ids(formData, "hipica_id", "miembro_id");
  const clases = Number(formData.get("clases"));
  const meses = Number(formData.get("meses"));
  const nota = String(formData.get("nota") ?? "").trim();
  const cobrar = formData.get("cobrar") === "si";
  const precioTexto = String(formData.get("precio") ?? "").trim().replace(",", ".");
  const precio = precioTexto === "" ? null : Number(precioTexto);
  if (
    !CLASES.includes(clases) ||
    !MESES.includes(meses) ||
    nota.length > 120 ||
    (precio !== null && (!Number.isFinite(precio) || precio < 0 || precio > 100000))
  ) {
    ficha(hipicaId, miembroId, "error=bono");
  }

  let caduca: string | null = null;
  if (meses > 0) {
    const d = new Date();
    d.setMonth(d.getMonth() + meses);
    caduca = d.toISOString().slice(0, 10);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("bonos").insert({
    hipica_id: hipicaId,
    miembro_id: miembroId,
    clases,
    caduca,
    nota: nota || null,
    cobrar,
    precio: cobrar ? precio : null,
  });
  if (error) {
    console.error("crear bono:", error.message);
    ficha(hipicaId, miembroId, "error=bono");
  }
  ficha(hipicaId, miembroId, "ok=bono");
}

export async function borrarBono(formData: FormData) {
  const [hipicaId, miembroId, bonoId] = ids(formData, "hipica_id", "miembro_id", "bono_id");
  const supabase = await createClient();
  const { error } = await supabase.from("bonos").delete().eq("id", bonoId).eq("hipica_id", hipicaId);
  if (error) console.error("borrar bono:", error.message);
  ficha(hipicaId, miembroId, "ok=bonoborrado");
}
