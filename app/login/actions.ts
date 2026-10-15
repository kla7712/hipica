"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function enviarEnlace(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email.includes("@")) redirect("/login?error=email");

  const origin = (await headers()).get("origin");
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/confirm` },
  });

  if (error) {
    console.error("signInWithOtp:", error.message);
    redirect("/login?error=envio");
  }
  redirect(`/login?enviado=${encodeURIComponent(email)}`);
}
