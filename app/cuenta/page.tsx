import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Aviso,
  Cabecera,
  CargandoApp,
  PantallaApp,
  Seccion,
  botonSecundario,
  campo,
  etiqueta,
  tarjeta,
} from "@/components/app/ui";
import { cerrarSesion } from "../actions";
import { borrarCuenta, cambiarAvisosEmail } from "./actions";
import { AvisosMovil, InstalarApp } from "@/components/app/avisos-movil";
import { esCuentaDemo } from "@/lib/demo";

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

async function Contenido({
  searchParams,
}: Pick<PageProps<"/cuenta">, "searchParams">) {
  const { error, ok } = await searchParams;
  const mensaje =
    typeof error === "string" && Object.hasOwn(ERRORES, error)
      ? ERRORES[error]
      : null;

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");
  const email = data.claims.email as string | undefined;
  const { data: yo } = await supabase
    .from("miembros")
    .select("avisos_email")
    .eq("user_id", data.claims.sub)
    .limit(1)
    .maybeSingle<{ avisos_email: boolean }>();
  const conEmail = yo?.avisos_email ?? true;
  // Solo se ofrece cuando hay servicio de email configurado (ver docs/avisos.md).
  const hayEmail = Boolean(
    process.env.RESEND_API_KEY && process.env.EMAIL_FROM,
  );

  return (
    <PantallaApp
      cabecera={
        <Cabecera
          volver={{ href: "/", texto: "Volver" }}
          cuenta={false}
          titulo="Mi cuenta"
          detalle={email}
        />
      }
    >
      <Seccion titulo="Avisos" id="avisos">
        <div className="space-y-3">
          <AvisosMovil demo={esCuentaDemo(email)} />
          <InstalarApp />
          {hayEmail && (
            <form
              action={cambiarAvisosEmail}
              className={`${tarjeta} flex flex-wrap items-center gap-3 p-4`}
            >
              <input
                type="hidden"
                name="activo"
                value={conEmail ? "no" : "si"}
              />
              <div className="min-w-0 flex-1 basis-48">
                <p className="font-bold">Avisos por email</p>
                <p className="text-sm text-tinta-suave">
                  {conEmail
                    ? `Activados${email ? `, a ${email}` : ""}.`
                    : "Desactivados. Solo los verás en la app y en el móvil."}
                </p>
                {(ok === "email-si" || ok === "email-no") && (
                  <p className="mt-1 text-sm font-semibold text-ok">
                    Guardado.
                  </p>
                )}
              </div>
              <button type="submit" className={botonSecundario}>
                {conEmail ? "Desactivar" : "Activar"}
              </button>
            </form>
          )}
        </div>
      </Seccion>

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
            Se borrarán tu cuenta, tus datos, los de los jinetes a tu cargo y
            todas vuestras reservas, en todas las hípicas. No se puede deshacer.
          </p>
          {mensaje && <Aviso tipo="error">{mensaje}</Aviso>}
          <form action={borrarCuenta} className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="confirmacion" className={etiqueta}>
                Escribe BORRAR para confirmar
              </label>
              <input
                id="confirmacion"
                name="confirmacion"
                required
                autoComplete="off"
                className={campo}
              />
            </div>
            <button
              type="submit"
              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-alerta px-4 font-bold text-white hover:brightness-90"
            >
              Borrar mi cuenta para siempre
            </button>
          </form>
        </div>
      </Seccion>
    </PantallaApp>
  );
}
