"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function crearHipica(formData: FormData) {
  const nombreHipica = String(formData.get("hipica") ?? "").trim();
  const tuNombre = String(formData.get("nombre") ?? "").trim();

  if (nombreHipica.length < 2 || tuNombre.length < 1) {
    redirect("/nueva-hipica?error=datos");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("crear_hipica", {
    p_nombre: nombreHipica,
    p_nombre_admin: tuNombre,
  });

  if (error) {
    console.error("crear_hipica:", error.message);
    redirect("/nueva-hipica?error=crear");
  }
  redirect("/");
}
