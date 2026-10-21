import { Suspense } from "react";
import Link from "next/link";
import { createClient, getUserId } from "@/lib/supabase/server";
import { Aviso, Pantalla, boton, campo, etiqueta } from "@/components/app/ui";
import { aceptarInvitacion } from "./actions";

const ROLES: Record<string, string> = { monitor: "monitor", alumno: "alumno" };

export default function UnirsePage({ params, searchParams }: PageProps<"/unirse/[token]">) {
  return (
    <Pantalla ancho="estrecho">
      <div className="space-y-8 pt-8 sm:pt-16">
        <Suspense fallback={<p className="text-tinta-suave">Cargando…</p>}>
          <Contenido params={params} searchParams={searchParams} />
        </Suspense>
      </div>
    </Pantalla>
  );
}

async function Contenido({ params, searchParams }: PageProps<"/unirse/[token]">) {
  const { token } = await params;
  const { error } = await searchParams;
  const aqui = `/unirse/${token}`;

  // Sin sesión: primero entrar con el email y volver aquí.
  const userId = await getUserId();
  if (!userId) {
    return (
      <>
        <div className="space-y-2">
          <h1 className="font-titulo text-4xl font-extrabold tracking-tight">Te han invitado</h1>
          <p className="text-tinta-suave">
            Para unirte a tu hípica, entra con tu email. Te mandaremos un enlace.
          </p>
        </div>
        <Link
          href={`/login?next=${encodeURIComponent(aqui)}`}
          className={`${boton} w-full`}
        >
          Entrar con mi email
        </Link>
      </>
    );
  }

  const supabase = await createClient();
  const { data } = await supabase.rpc("ver_invitacion", { p_token: token });
  const inv = (data as { hipica_nombre: string; rol: string }[] | null)?.[0];

  if (!inv) {
    return (
      <div className="space-y-4">
        <h1 className="font-titulo text-4xl font-extrabold tracking-tight">Invitación no válida</h1>
        <p className="text-tinta-suave">
          El enlace ha caducado o ya se ha usado. Pide uno nuevo a tu hípica.
        </p>
        <Link href="/" className="font-semibold text-cuadra underline">
          Ir al inicio
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        <h1 className="font-titulo text-4xl font-extrabold tracking-tight">Únete a {inv.hipica_nombre}</h1>
        <p className="text-tinta-suave">
          Entrarás como {ROLES[inv.rol] ?? inv.rol}. Dinos cómo te llamas para que la hípica te
          reconozca.
        </p>
      </div>
      <form action={aceptarInvitacion} className="space-y-4">
        <input type="hidden" name="token" value={token} />
        <div className="space-y-2">
          <label htmlFor="nombre" className={etiqueta}>
            Nombre y apellido
          </label>
          <input
            id="nombre"
            name="nombre"
            required
            maxLength={120}
            autoComplete="name"
            className={campo}
          />
        </div>
        {error === "nombre" && <Aviso tipo="error">Escribe tu nombre.</Aviso>}
        {error === "invalida" && (
          <Aviso tipo="error">No se ha podido usar la invitación. Pide una nueva.</Aviso>
        )}
        <button
          type="submit"
          className={`${boton} w-full`}
        >
          Unirme
        </button>
      </form>
    </>
  );
}
