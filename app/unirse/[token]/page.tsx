import { Suspense } from "react";
import Link from "next/link";
import { createClient, getUserId } from "@/lib/supabase/server";
import { aceptarInvitacion } from "./actions";

const ROLES: Record<string, string> = { monitor: "monitor", alumno: "alumno" };

export default function UnirsePage({ params, searchParams }: PageProps<"/unirse/[token]">) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <Suspense fallback={<p className="text-sm text-neutral-500">Cargando…</p>}>
          <Contenido params={params} searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
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
          <h1 className="text-2xl font-semibold tracking-tight">Te han invitado</h1>
          <p className="text-sm text-neutral-600">
            Para unirte a tu hípica, entra con tu email. Te mandaremos un enlace.
          </p>
        </div>
        <Link
          href={`/login?next=${encodeURIComponent(aqui)}`}
          className="block w-full rounded-lg bg-neutral-900 px-4 py-2.5 text-center font-medium text-white hover:bg-neutral-800"
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
        <h1 className="text-2xl font-semibold tracking-tight">Invitación no válida</h1>
        <p className="text-sm text-neutral-600">
          El enlace ha caducado o ya se ha usado. Pide uno nuevo a tu hípica.
        </p>
        <Link href="/" className="text-sm underline">
          Ir al inicio
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Únete a {inv.hipica_nombre}</h1>
        <p className="text-sm text-neutral-600">
          Entrarás como {ROLES[inv.rol] ?? inv.rol}. Dinos cómo te llamas para que la hípica te
          reconozca.
        </p>
      </div>
      <form action={aceptarInvitacion} className="space-y-4">
        <input type="hidden" name="token" value={token} />
        <div className="space-y-2">
          <label htmlFor="nombre" className="text-sm font-medium">
            Nombre y apellido
          </label>
          <input
            id="nombre"
            name="nombre"
            required
            maxLength={120}
            autoComplete="name"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-base outline-none focus:border-neutral-900"
          />
        </div>
        {error === "nombre" && <p className="text-sm text-red-700">Escribe tu nombre.</p>}
        {error === "invalida" && (
          <p className="text-sm text-red-700">No se ha podido usar la invitación. Pide una nueva.</p>
        )}
        <button
          type="submit"
          className="w-full rounded-lg bg-neutral-900 px-4 py-2.5 font-medium text-white hover:bg-neutral-800"
        >
          Unirme
        </button>
      </form>
    </>
  );
}
