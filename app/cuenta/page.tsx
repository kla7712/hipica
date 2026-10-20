import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Aviso, Cabecera, Pantalla, Volver, campo, etiqueta } from "@/components/app/ui";
import { cerrarSesion } from "../actions";
import { borrarCuenta } from "./actions";

const ERRORES: Record<string, string> = {
  confirmar: "Escribe BORRAR para confirmar.",
  admin:
    "Eres el único administrador de una hípica con alumnos. Antes de borrar tu cuenta, nombra a otro administrador o da de baja a los miembros.",
  borrar: "No se ha podido borrar la cuenta. Vuelve a intentarlo.",
};

export default function CuentaPage({ searchParams }: PageProps<"/cuenta">) {
  return (
    <Pantalla>
      <Volver href="/">Tus hípicas</Volver>
      <Suspense fallback={<p className="mt-8 text-tinta-suave">Cargando…</p>}>
        <Contenido searchParams={searchParams} />
      </Suspense>
    </Pantalla>
  );
}

async function Contenido({ searchParams }: Pick<PageProps<"/cuenta">, "searchParams">) {
  const { error } = await searchParams;
  const mensaje = typeof error === "string" && Object.hasOwn(ERRORES, error) ? ERRORES[error] : null;

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims?.email as string | undefined;
  if (!data?.claims) redirect("/login");

  return (
    <div className="mt-4 space-y-8">
      <Cabecera titulo="Mi cuenta" detalle={email} />

      <form action={cerrarSesion}>
        <button
          type="submit"
          className="inline-flex min-h-11 items-center rounded-lg border border-linea bg-white px-4 font-medium hover:border-tinta-suave"
        >
          Cerrar sesión
        </button>
      </form>

      <section className="space-y-4 rounded-xl border border-alerta/30 bg-white p-5">
        <div className="space-y-1">
          <h2 className="text-xl font-bold [font-stretch:85%]">Borrar mi cuenta</h2>
          <p className="text-tinta-suave">
            Se borrarán tu cuenta, tus datos, los de los jinetes a tu cargo y todas vuestras reservas, en todas las
            hípicas. No se puede deshacer.
          </p>
        </div>
        {mensaje && <Aviso tipo="error">{mensaje}</Aviso>}
        <form action={borrarCuenta} className="space-y-3">
          <div className="space-y-2">
            <label htmlFor="confirmacion" className={etiqueta}>
              Escribe BORRAR para confirmar
            </label>
            <input id="confirmacion" name="confirmacion" required autoComplete="off" className={campo} />
          </div>
          <button
            type="submit"
            className="inline-flex min-h-11 items-center rounded-lg bg-alerta px-4 font-semibold text-white hover:brightness-90"
          >
            Borrar mi cuenta para siempre
          </button>
        </form>
      </section>
    </div>
  );
}
