// Se ejecuta antes de cada página: refresca la sesión de Supabase y manda
// a /login a quien no la tenga iniciada.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const RUTAS_PUBLICAS = ["/login", "/auth"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  // No pongas código entre createServerClient y getClaims: refresca la sesión.
  const { data } = await supabase.auth.getClaims();
  const conSesion = Boolean(data?.claims);

  const { pathname } = request.nextUrl;
  const esPublica = RUTAS_PUBLICAS.some((r) => pathname === r || pathname.startsWith(`${r}/`));

  if (!conSesion && !esPublica) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Todo menos archivos estáticos e imágenes.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
