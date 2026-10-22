"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function aceptarInvitacion(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!/^[0-9a-f]{32}$/i.test(token)) redirect("/");
  if (nombre.length < 1 || nombre.length > 120) redirect(`/unirse/${token}?error=nombre`);

  const supabase = await createClient();
  const { data: hipicaId, error } = await supabase.rpc("aceptar_invitacion", {
    p_token: token,
    p_nombre: nombre,
  });

  if (error || !hipicaId) {
    console.error("aceptar_invitacion:", error?.message);
    redirect(`/unirse/${token}?error=invalida`);
  }
  redirect(`/hipica/${hipicaId}`);
}

// Alta de una familia o propietario con el enlace de alumnos.
export async function solicitarAlta(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  if (!/^[0-9a-f]{32}$/i.test(token)) redirect("/");
  const nombre = String(formData.get("nombre") ?? "").trim();
  const telefono = String(formData.get("telefono") ?? "").trim();
  const nota = String(formData.get("nota") ?? "").trim();
  let jinetes: unknown = [];
  let caballo: unknown = null;
  try {
    jinetes = JSON.parse(String(formData.get("jinetes") ?? "[]"));
    const c = String(formData.get("caballo") ?? "");
    caballo = c ? JSON.parse(c) : null;
  } catch {
    redirect(`/unirse/${token}?error=datos`);
  }
  if (nombre.length < 1 || nombre.length > 120 || telefono.length > 30 || nota.length > 300) {
    redirect(`/unirse/${token}?error=datos`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("solicitar_alta", {
    p_token: token,
    p_nombre: nombre,
    p_telefono: telefono,
    p_jinetes: jinetes,
    p_caballo: caballo,
    p_nota: nota || null,
  });
  if (error) {
    console.error("solicitar_alta:", error.message);
    const m = error.message;
    redirect(
      `/unirse/${token}?error=${
        m.includes("pendiente") ? "pendiente" : m.includes("no válida") ? "invalida" : m.includes("montar") ? "vacio" : "datos"
      }`,
    );
  }
  redirect(data === "pendiente" ? "/?alta=enviada" : "/");
}
