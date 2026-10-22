import { Suspense } from "react";
import Link from "next/link";
import { Aviso, Cabecera, CargandoApp, Filtros, PantallaApp, Seccion, Vacio } from "@/components/app/ui";
import { cargarContexto, fechas, navegacion, type Contexto } from "@/lib/hipica";
import { textoAviso } from "@/lib/avisos";
import { FormServicios } from "./form-servicios";
import { ListaSolicitudes, type Solicitud } from "./solicitudes";

type Servicio = { id: string; nombre: string; descripcion: string | null; precio: number | null };

const MENSAJES: Record<string, { tipo: "ok" | "error"; texto: string }> = {
  pedido: { tipo: "ok", texto: "¡Pedido! La hípica lo confirmará y lo verás aquí." },
  "error-vacio": { tipo: "error", texto: "Elige al menos un servicio." },
  "error-datos": { tipo: "error", texto: "Revisa el día y la nota." },
  "error-muchas": { tipo: "error", texto: "Tienes muchas solicitudes pendientes. Espera a que la hípica las confirme." },
  "error-pedir": { tipo: "error", texto: "No se ha podido enviar. Vuelve a intentarlo." },
};

export default function ServiciosPage({ params, searchParams }: PageProps<"/hipica/[id]/servicios">) {
  return (
    <Suspense fallback={<CargandoApp />}>
      <Contenido params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Contenido({ params, searchParams }: PageProps<"/hipica/[id]/servicios">) {
  const { id } = await params;
  const q = await searchParams;
  const ctx = await cargarContexto(id);
  const codigo = typeof q.ok === "string" ? q.ok : typeof q.error === "string" ? `error-${q.error}` : null;
  const mensaje = codigo && Object.hasOwn(MENSAJES, codigo) ? MENSAJES[codigo] : null;
  const aviso = textoAviso(q.aviso);
  return ctx.esEquipo ? (
    <Equipo ctx={ctx} aviso={aviso} />
  ) : (
    <Propietario ctx={ctx} caballoId={typeof q.caballo === "string" ? q.caballo : undefined} mensaje={mensaje} aviso={aviso} />
  );
}

/* ---------- Propietario: pedir servicios para su caballo ---------- */

async function Propietario({
  ctx,
  caballoId,
  mensaje,
  aviso,
}: {
  ctx: Contexto;
  caballoId?: string;
  mensaje: { tipo: "ok" | "error"; texto: string } | null;
  aviso: string | null;
}) {
  const { supabase, hipica } = ctx;
  const base = `/hipica/${hipica.id}`;
  const nav = navegacion(ctx, "servicios");
  const caballo = ctx.misCaballos.find((c) => c.id === caballoId) ?? ctx.misCaballos[0];

  if (!caballo) {
    return (
      <PantallaApp nav={nav} cabecera={<Cabecera antetitulo={hipica.nombre} titulo="Servicios" />}>
        <Vacio>Los servicios son para los propietarios de caballos en pupilaje.</Vacio>
      </PantallaApp>
    );
  }

  const f = fechas(hipica.zona_horaria);
  const ahora = new Date();
  const [{ data: servicios }, { data: solicitudes }] = await Promise.all([
    supabase
      .from("servicios")
      .select("id, nombre, descripcion, precio")
      .eq("hipica_id", hipica.id)
      .eq("activo", true)
      .order("orden")
      .order("nombre")
      .returns<Servicio[]>(),
    supabase
      .from("solicitudes")
      .select("id, caballo_id, fecha, servicios, total, nota, estado, created_at")
      .eq("caballo_id", caballo.id)
      .order("created_at", { ascending: false })
      .limit(10)
      .returns<Solicitud[]>(),
  ]);

  const dias: { valor: string; corto: string; numero: string }[] = [];
  for (let i = 0; dias.length < 7 && i < 9; i++) {
    const d = new Date(ahora.getTime() + i * 864e5);
    const valor = f.clave(d);
    if (!dias.some((x) => x.valor === valor)) dias.push({ valor, corto: i === 0 ? "Hoy" : f.corto(d), numero: f.numero(d) });
  }

  return (
    <PantallaApp
      nav={nav}
      cabecera={<Cabecera antetitulo={`Para ${caballo.nombre}`} titulo="Servicios" demo={ctx.demo} />}
    >
      <div className="space-y-4">
        {mensaje && <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso>}
        {aviso && <Aviso tipo="error">{aviso}</Aviso>}
        {ctx.misCaballos.length > 1 && (
          <Filtros
            opciones={ctx.misCaballos.map((c) => ({
              texto: c.nombre,
              href: `${base}/servicios?caballo=${c.id}`,
              activo: c.id === caballo.id,
            }))}
          />
        )}
      </div>

      <div className="mt-5">
        {(servicios ?? []).length === 0 ? (
          <Vacio>La hípica aún no ha publicado sus servicios.</Vacio>
        ) : (
          <FormServicios hipicaId={hipica.id} caballoId={caballo.id} servicios={servicios ?? []} dias={dias} />
        )}
      </div>

      {(solicitudes ?? []).length > 0 && (
        <Seccion titulo="Lo que has pedido" id="pedidos">
          <ListaSolicitudes
            solicitudes={solicitudes ?? []}
            hipicaId={hipica.id}
            volver={`${base}/servicios`}
            modo="propietario"
          />
        </Seccion>
      )}

      <p className="mt-6 text-sm">
        <Link href={`${base}/caballos/${caballo.id}`} className="font-bold text-cuadra underline">
          Ver la ficha de {caballo.nombre}
        </Link>
      </p>
    </PantallaApp>
  );
}

/* ---------- Equipo: todas las solicitudes ---------- */

async function Equipo({ ctx, aviso }: { ctx: Contexto; aviso: string | null }) {
  const { supabase, hipica } = ctx;
  const base = `/hipica/${hipica.id}`;
  const hoy = fechas(hipica.zona_horaria).clave(new Date());
  const hace14 = new Date(Date.parse(`${hoy}T12:00:00Z`) - 14 * 864e5).toISOString().slice(0, 10);

  const [{ data: solicitudes }, { data: caballos }] = await Promise.all([
    supabase
      .from("solicitudes")
      .select("id, caballo_id, fecha, servicios, total, nota, estado, created_at")
      .eq("hipica_id", hipica.id)
      .gte("fecha", hace14)
      .order("fecha")
      .returns<Solicitud[]>(),
    supabase.from("caballos").select("id, nombre").eq("hipica_id", hipica.id).returns<{ id: string; nombre: string }[]>(),
  ]);
  const nombres = new Map((caballos ?? []).map((c) => [c.id, c.nombre]));
  const lista = solicitudes ?? [];
  const pendientes = lista.filter((s) => s.estado === "pendiente");
  const aceptadas = lista.filter((s) => s.estado === "aceptada");
  const resto = lista.filter((s) => s.estado === "hecha" || s.estado === "rechazada").reverse();
  const props = {
    hipicaId: hipica.id,
    volver: `${base}/servicios`,
    modo: "equipo" as const,
    puedeAceptar: ctx.esStaff,
    nombreCaballo: (id: string) => nombres.get(id) ?? null,
  };

  return (
    <PantallaApp
      nav={navegacion(ctx, ctx.yo.rol === "cuadra" ? "cuadra" : "inicio")}
      cabecera={<Cabecera volver={ctx.yo.rol === "cuadra" ? { href: `${base}/cuadra`, texto: "Cuadra" } : { href: base, texto: "Hoy" }} titulo="Servicios pedidos" detalle="Lo que piden los propietarios" />}
    >
      {aviso && (
        <div className="mb-5">
          <Aviso tipo="error">{aviso}</Aviso>
        </div>
      )}
      <Seccion titulo="Por confirmar" id="pendientes">
        {pendientes.length ? <ListaSolicitudes solicitudes={pendientes} {...props} /> : <Vacio>No hay nada por confirmar.</Vacio>}
      </Seccion>
      <Seccion titulo="Aceptadas, por hacer" id="aceptadas">
        {aceptadas.length ? <ListaSolicitudes solicitudes={aceptadas} {...props} /> : <Vacio>Nada pendiente de hacer.</Vacio>}
      </Seccion>
      {resto.length > 0 && (
        <Seccion titulo="Últimas dos semanas" id="hechas">
          <ListaSolicitudes solicitudes={resto} {...props} />
        </Seccion>
      )}
      {ctx.esAdmin && (
        <p className="mt-6 text-sm text-tinta-suave">
          Los servicios y sus precios se cambian en{" "}
          <Link href={`${base}/ajustes#servicios`} className="font-bold text-cuadra underline">
            Ajustes
          </Link>
          .
        </p>
      )}
    </PantallaApp>
  );
}
