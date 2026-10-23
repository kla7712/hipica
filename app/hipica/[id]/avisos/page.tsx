import { Suspense } from "react";
import Link from "next/link";
import {
  Cabecera,
  CargandoApp,
  Icono,
  PantallaApp,
  Seccion,
  Vacio,
  tarjeta,
} from "@/components/app/ui";
import { AvisosMovil } from "@/components/app/avisos-movil";
import { cargarContexto, navegacion } from "@/lib/hipica";
import { MarcarLeidos } from "./marcar-leidos";

type Notificacion = {
  id: string;
  titulo: string;
  texto: string;
  url: string;
  created_at: string;
  leida_en: string | null;
};

export default function AvisosPage({
  params,
}: PageProps<"/hipica/[id]/avisos">) {
  return (
    <Suspense fallback={<CargandoApp />}>
      <Contenido params={params} />
    </Suspense>
  );
}

async function Contenido({
  params,
}: Pick<PageProps<"/hipica/[id]/avisos">, "params">) {
  const { id } = await params;
  const ctx = await cargarContexto(id);
  const { supabase, hipica } = ctx;
  const { data } = await supabase
    .from("notificaciones")
    .select("id, titulo, texto, url, created_at, leida_en")
    .eq("miembro_id", ctx.yo.id)
    .order("created_at", { ascending: false })
    .limit(60)
    .returns<Notificacion[]>();
  const lista = data ?? [];
  const nuevos = lista.filter((n) => !n.leida_en);
  const anteriores = lista.filter((n) => n.leida_en);

  const cuando = new Intl.DateTimeFormat("es-ES", {
    timeZone: hipica.zona_horaria,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const fila = (n: Notificacion, nuevo: boolean) => {
    const contenido = (
      <>
        <span
          aria-hidden="true"
          className={`mt-1.5 size-2.5 shrink-0 rounded-full ${nuevo ? "bg-punto-atencion" : "bg-transparent"}`}
        />
        <span className="min-w-0 flex-1">
          <span className="block font-bold leading-snug">{n.titulo}</span>
          {n.texto && (
            <span className="mt-0.5 block text-sm text-tinta-suave">
              {n.texto}
            </span>
          )}
          <span className="mt-1 block text-xs font-semibold text-tinta-suave first-letter:uppercase">
            {cuando.format(new Date(n.created_at))}
          </span>
        </span>
        {n.url && (
          <Icono
            nombre="flecha"
            className="mt-1 size-5 shrink-0 text-tinta-suave"
          />
        )}
      </>
    );
    return (
      <li key={n.id}>
        {n.url ? (
          <Link href={n.url} className="flex gap-3 px-4 py-3.5 hover:bg-limo">
            {contenido}
          </Link>
        ) : (
          <div className="flex gap-3 px-4 py-3.5">{contenido}</div>
        )}
      </li>
    );
  };

  return (
    <PantallaApp
      nav={navegacion(ctx, null)}
      cabecera={
        <Cabecera
          volver={{ href: `/hipica/${id}`, texto: "Inicio" }}
          antetitulo={hipica.nombre}
          titulo="Avisos"
          detalle={
            nuevos.length
              ? `${nuevos.length} ${nuevos.length === 1 ? "nuevo" : "nuevos"}`
              : "Estás al día."
          }
        />
      }
    >
      <MarcarLeidos hipicaId={id} hay={nuevos.length > 0} />
      {lista.length === 0 ? (
        <Vacio>
          Aquí te aparecerán las cancelaciones, las plazas libres, los recibos y
          lo que te toque decidir.
        </Vacio>
      ) : (
        <>
          {nuevos.length > 0 && (
            <Seccion titulo="Nuevos" id="nuevos">
              <ul
                className={`${tarjeta} divide-y divide-linea overflow-hidden`}
              >
                {nuevos.map((n) => fila(n, true))}
              </ul>
            </Seccion>
          )}
          {anteriores.length > 0 && (
            <Seccion
              titulo={nuevos.length ? "Anteriores" : "Últimos avisos"}
              id="anteriores"
            >
              <ul
                className={`${tarjeta} divide-y divide-linea overflow-hidden`}
              >
                {anteriores.map((n) => fila(n, false))}
              </ul>
            </Seccion>
          )}
        </>
      )}
      <div className="mt-8 space-y-3">
        <AvisosMovil demo={ctx.demo} />
        {process.env.RESEND_API_KEY && process.env.EMAIL_FROM && (
          <p className="text-sm text-tinta-suave">
            Los avisos también te llegan por email. Puedes quitarlos en{" "}
            <Link
              href="/cuenta#avisos"
              className="font-semibold text-cuadra underline"
            >
              Mi cuenta
            </Link>
            .
          </p>
        )}
      </div>
    </PantallaApp>
  );
}
