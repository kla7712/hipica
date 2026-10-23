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

function destino(formData: FormData, hipicaId: string) {
  const v = String(formData.get("volver") ?? "");
  const base = `/hipica/${hipicaId}`;
  return v === base || v.startsWith(`${base}/`) ? v.split("?")[0] : `${base}/servicios`;
}

// El propietario pide uno o varios servicios para su caballo.
export async function pedirServicios(formData: FormData) {
  const [hipicaId, caballoId] = ids(formData, "hipica_id", "caballo_id");
  const servicios = formData.getAll("servicio").map(String);
  const fecha = String(formData.get("fecha") ?? "");
  const nota = String(formData.get("nota") ?? "").trim();
  const aqui = `/hipica/${hipicaId}/servicios?caballo=${caballoId}`;
  if (servicios.length === 0) redirect(`${aqui}&error=vacio`);
  if (!servicios.every((s) => UUID.test(s)) || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || nota.length > 300) {
    redirect(`${aqui}&error=datos`);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("pedir_servicios", {
    p_caballo: caballoId,
    p_servicios: servicios,
    p_fecha: fecha,
    p_nota: nota || null,
  });
  avisar();
  if (error) {
    console.error("pedir servicios:", error.message);
    redirect(`${aqui}&error=${error.message.includes("demasiadas") ? "muchas" : "pedir"}`);
  }
  redirect(`${aqui}&ok=pedido`);
}

// Equipo: aceptar / rechazar / hecha. Propietario: retirar una pendiente.
export async function responderSolicitud(formData: FormData) {
  const [hipicaId, solicitudId] = ids(formData, "hipica_id", "solicitud_id");
  const estado = String(formData.get("estado") ?? "");
  if (!["aceptada", "rechazada", "hecha", "pendiente", "retirada"].includes(estado)) redirect("/");

  const supabase = await createClient();
  const { error } = await supabase.rpc("responder_solicitud", { p_solicitud: solicitudId, p_estado: estado });
  avisar();
  if (error) {
    console.error("responder solicitud:", error.message);
    redirect(`${destino(formData, hipicaId)}?aviso=error`);
  }
  refresh();
}
