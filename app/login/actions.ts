"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { rutaSegura } from "@/lib/rutas";

export async function enviarEnlace(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const next = rutaSegura(formData.get("next"));
  const volver = (q: string) =>
    redirect(`/login?${q}${next !== "/" ? `&next=${encodeURIComponent(next)}` : ""}`);

  if (!email.includes("@")) volver("error=email");

  const origin = (await headers()).get("origin");
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(next)}` },
  });

  if (error) {
    console.error("signInWithOtp:", error.message);
    volver("error=envio");
  }
  volver(`enviado=${encodeURIComponent(email)}`);
}
