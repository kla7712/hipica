"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Borra la cuenta y todos sus datos (derecho de supresión del RGPD).
export async function borrarCuenta(formData: FormData) {
  if (String(formData.get("confirmacion") ?? "").trim().toUpperCase() !== "BORRAR") {
    redirect("/cuenta?error=confirmar");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("borrar_mi_cuenta");
  if (error) {
    console.error("borrar_mi_cuenta:", error.message);
    redirect(`/cuenta?error=${error.message.includes("único administrador") ? "admin" : "borrar"}`);
  }

  await supabase.auth.signOut();
  redirect("/login?aviso=borrada");
}
