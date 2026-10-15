// Cliente de Supabase para el servidor: páginas, server actions y route handlers.
// Crea uno nuevo en cada petición; nunca lo reutilices entre peticiones.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Desde una página (Server Component) no se pueden escribir cookies.
            // No pasa nada: proxy.ts ya refresca la sesión en cada petición.
          }
        },
      },
    },
  );
}

// Devuelve el id del usuario con sesión iniciada, o null.
export async function getUserId() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims?.sub ?? null;
}
