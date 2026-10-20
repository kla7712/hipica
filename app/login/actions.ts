"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { rutaSegura } from "@/lib/rutas";

const EMAIL = /^[^\s@<>]{1,64}@[^\s@<>]{1,190}$/;

function volver(query: Record<string, string>, next: string): never {
  const q = new URLSearchParams(query);
  if (next !== "/") q.set("next", next);
  redirect(`/login?${q.toString()}`);
}

// Paso 1: enviar el email con el código (y el enlace, como alternativa).
export async function enviarEnlace(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const next = rutaSegura(formData.get("next"));
  if (!EMAIL.test(email)) volver({ error: "email" }, next);

  const origin = (await headers()).get("origin");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(next)}` },
  });

  if (error) {
    console.error("signInWithOtp:", error.message);
    volver({ error: error.status === 429 ? "limite" : "envio" }, next);
  }
  volver({ enviado: email }, next);
}

// Paso 2: entrar con el código del email. Funciona en cualquier navegador
// y dentro de la app instalada, sin depender de dónde se abra el enlace.
export async function verificarCodigo(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const codigo = String(formData.get("codigo") ?? "").replace(/\s/g, "");
  const next = rutaSegura(formData.get("next"));
  if (!EMAIL.test(email)) volver({ error: "email" }, next);
  if (!/^\d{6,10}$/.test(codigo)) volver({ enviado: email, error: "codigo" }, next);

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token: codigo, type: "email" });
  if (error) {
    console.error("verifyOtp:", error.message);
    volver({ enviado: email, error: "codigo" }, next);
  }
  redirect(next);
}

// Entrar con Google: no necesita email. Supabase lleva al usuario a Google y
// lo devuelve a /auth/confirm, que guarda la sesión.
export async function entrarConGoogle(formData: FormData) {
  const next = rutaSegura(formData.get("next"));
  const origin = (await headers()).get("origin");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) {
    console.error("signInWithOAuth:", error?.message);
    volver({ error: "google" }, next);
  }
  redirect(data.url);
}
