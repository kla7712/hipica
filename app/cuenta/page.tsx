import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Aviso, Cabecera, CargandoApp, PantallaApp, Seccion, botonSecundario, campo, etiqueta, tarjeta } from "@/components/app/ui";
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
    <Suspense fallback={<CargandoApp />}>
      <Contenido searchParams={searchParams} />
    </Suspense>
  );
}

async function Contenido({ searchParams }: Pick<PageProps<"/cuenta">, "searchParams">) {
  const { error } = await searchParams;
  const mensaje = typeof error === "string" && Object.hasOwn(ERRORES, error) ? ERRORES[error] : null;

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");
  const email = data.claims.email as string | undefined;

  return (
    <PantallaApp
      cabecera={<Cabecera volver={{ href: "/", texto: "Volver" }} cuenta={false} titulo="Mi cuenta" detalle={email} />}
    >
      <Seccion titulo="Sesión" id="sesion">
        <form action={cerrarSesion} className={`${tarjeta} p-4`}>
          <button type="submit" className={`${botonSecundario} w-full`}>
            Cerrar sesión
          </button>
        </form>
      </Seccion>

      <Seccion titulo="Borrar mi cuenta" id="borrar">
        <div className={`${tarjeta} space-y-4 p-4`}>
          <p className="text-tinta-suave">
            Se borrarán tu cuenta, tus datos, los de los jinetes a tu cargo y todas vuestras reservas, en todas las hípicas.
            No se puede deshacer.
          </p>
          {mensaje && <Aviso tipo="error">{mensaje}</Aviso>}
          <form action={borrarCuenta} className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="confirmacion" className={etiqueta}>
                Escribe BORRAR para confirmar
              </label>
              <input id="confirmacion" name="confirmacion" required autoComplete="off" className={campo} />
            </div>
            <button type="submit" className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-alerta px-4 font-bold text-white hover:brightness-90">
              Borrar mi cuenta para siempre
            </button>
          </form>
        </div>
      </Seccion>
    </PantallaApp>
  );
}
