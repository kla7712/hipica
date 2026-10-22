import { Suspense } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import {
  Resumen,
  Aviso,
  Cabecera,
  CargandoApp,
  Chip,
  Cifras,
  Filtros,
  Icono,
  Inicial,
  PantallaApp,
  Seccion,
  Segmento,
  Vacio,
  boton,
  botonTexto,
  campo,
  etiqueta,
  tarjeta,
} from "@/components/app/ui";
import { cargarContexto, fechas, navegacion } from "@/lib/hipica";
import { resumenBono, type EstadoBono } from "@/lib/tipos";
import { anadirSinCuenta, borrarInvitacion, crearInvitacion } from "./actions";

type Invitacion = { id: string; rol: string; token: string; usos: number; usos_max: number | null; expira_en: string };

const MENSAJES: Record<string, { tipo: "ok" | "error"; texto: string }> = {
  baja: { tipo: "ok", texto: "Dado de baja. Sus reservas futuras se han anulado." },
  "error-baja": { tipo: "error", texto: "No se ha podido dar de baja." },
  "error-invitar": { tipo: "error", texto: "No se ha podido crear la invitación. Vuelve a intentarlo." },
  "error-sincuenta": { tipo: "error", texto: "No se ha podido añadir. Revisa el nombre." },
};

export default function MiembrosPage({ params, searchParams }: PageProps<"/hipica/[id]/miembros">) {
  return (
    <Suspense fallback={<CargandoApp />}>
      <Contenido params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Contenido({ params, searchParams }: PageProps<"/hipica/[id]/miembros">) {
  const { id } = await params;
  const { f: filtroQ, ok, error: codigoError } = await searchParams;
  const ctx = await cargarContexto(id);
  const { supabase, hipica } = ctx;
  const nav = navegacion(ctx, "horario");
  const base = `/hipica/${id}`;

  if (!ctx.esAdmin) {
    return (
      <PantallaApp nav={nav} cabecera={<Cabecera antetitulo={hipica.nombre} titulo="Alumnos" />}>
        <Vacio>Solo el administrador puede gestionar los alumnos.</Vacio>
      </PantallaApp>
    );
  }

  const ahora = new Date();
  const [{ data: estado }, { data: invitaciones }] = await Promise.all([
    supabase.rpc("estado_bonos", { p_hipica: id }),
    supabase
      .from("invitaciones")
      .select("id, rol, token, usos, usos_max, expira_en")
      .eq("hipica_id", id)
      .eq("rol", "alumno")
      .gt("expira_en", ahora.toISOString())
      .order("created_at", { ascending: false })
      .returns<Invitacion[]>(),
  ]);

  const hoy = fechas(hipica.zona_horaria).clave(ahora);
  const alumnos = (estado ?? []) as EstadoBono[];
  const porId = new Map(alumnos.map((a) => [a.miembro_id, a]));
  // Titulares que no montan (no tienen bono y sí jinetes a cargo) no cuentan como alumnos.
  const jinetes = alumnos.filter((a) => a.bono_id || !alumnos.some((x) => x.titular_id === a.miembro_id));
  const renovar = jinetes.filter((a) => a.bono_id && resumenBono(a, hoy).renovar);
  const sinBono = jinetes.filter((a) => !a.bono_id);
  const filtro = filtroQ === "renovar" || filtroQ === "sinbono" ? filtroQ : "todos";
  const lista = filtro === "renovar" ? renovar : filtro === "sinbono" ? sinBono : alumnos;

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  const enlaceBase = `${proto}://${host}`;
  const activas = (invitaciones ?? []).filter((i) => i.usos_max === null || i.usos < i.usos_max);
  const fFecha = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", timeZone: hipica.zona_horaria });

  const codigo = typeof ok === "string" ? ok : typeof codigoError === "string" ? `error-${codigoError}` : null;
  const mensaje = codigo && Object.hasOwn(MENSAJES, codigo) ? MENSAJES[codigo] : null;

  return (
    <PantallaApp
      nav={nav}
      cabecera={
        <Cabecera antetitulo={hipica.nombre} titulo="Alumnos" demo={ctx.demo}>
          <Segmento
            label="Ver"
            opciones={[
              { texto: "Horario", href: `${base}/horario`, activo: false },
              { texto: "Alumnos", href: `${base}/miembros`, activo: true },
            ]}
          />
          <Cifras
            items={[
              { valor: jinetes.length, texto: "alumnos", href: `${base}/miembros` },
              { valor: renovar.length, texto: "bonos por renovar", href: `${base}/miembros?f=renovar` },
              { valor: sinBono.length, texto: "sin bono", href: `${base}/miembros?f=sinbono` },
            ]}
          />
        </Cabecera>
      }
    >
      {mensaje && (
        <div className="mb-5">
          <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso>
        </div>
      )}

      <Seccion titulo="Alumnos" id="alumnos">
        <div className="mb-3">
          <Filtros
            opciones={[
              { texto: "Todos", href: `${base}/miembros`, activo: filtro === "todos" },
              { texto: `Por renovar (${renovar.length})`, href: `${base}/miembros?f=renovar`, activo: filtro === "renovar" },
              { texto: `Sin bono (${sinBono.length})`, href: `${base}/miembros?f=sinbono`, activo: filtro === "sinbono" },
            ]}
          />
        </div>
        {lista.length === 0 ? (
          <Vacio>{filtro === "todos" ? "Aún no hay alumnos. Invítalos con el enlace de abajo." : "Nadie en esta lista."}</Vacio>
        ) : (
          <ul className={`${tarjeta} divide-y divide-linea overflow-hidden`}>
            {lista.map((a) => {
              const r = resumenBono(a, hoy);
              const titular = a.titular_id ? porId.get(a.titular_id) : null;
              const esTitularSinMontar = !a.bono_id && alumnos.some((x) => x.titular_id === a.miembro_id);
              return (
                <li key={a.miembro_id}>
                  <Link href={`${base}/miembros/${a.miembro_id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-limo">
                    <Inicial nombre={a.nombre} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold">{a.nombre}</span>
                      <span className="block text-sm text-tinta-suave">
                        {[
                          a.nivel ?? (esTitularSinMontar ? null : "Sin nivel"),
                          titular && `de ${titular.nombre}`,
                          esTitularSinMontar && "Titular de la cuenta",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    {!esTitularSinMontar && <Chip tono={r.tono}>{r.texto}</Chip>}
                    <Icono nombre="flecha" className="size-5 shrink-0 text-tinta-suave" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Seccion>

      <Seccion titulo="Invitar alumnos" id="invitar">
        <div className={`${tarjeta} space-y-4 p-4`}>
          <p className="text-sm text-tinta-suave">
            Comparte el enlace por WhatsApp. Quien lo abra entra con su email y queda unido a tu hípica. Las familias
            pueden añadir después a sus hijos.
          </p>
          <div className="flex flex-wrap gap-2">
            <form action={crearInvitacion}>
              <input type="hidden" name="hipica_id" value={id} />
              <input type="hidden" name="rol" value="alumno" />
              <button type="submit" className={boton}>
                Crear enlace para alumnos
              </button>
            </form>
          </div>
          {activas.map((inv) => {
            const url = `${enlaceBase}/unirse/${inv.token}`;
            const texto = `Únete a ${hipica.nombre} para reservar tus clases: ${url}`;
            return (
              <div key={inv.id} className="space-y-2 rounded-xl bg-limo p-3">
                <p className="text-sm">
                  <span className="font-bold">{inv.rol === "alumno" ? "Enlace para alumnos" : "Enlace para un monitor"}</span>
                  <span className="text-tinta-suave">
                    {" · "}
                    {inv.usos_max === null ? `${inv.usos} ${inv.usos === 1 ? "uso" : "usos"}` : "un solo uso"} · caduca el{" "}
                    {fFecha.format(new Date(inv.expira_en))}
                  </span>
                </p>
                <label className="sr-only" htmlFor={`url-${inv.id}`}>
                  Enlace de invitación
                </label>
                <input id={`url-${inv.id}`} readOnly value={url} className={`${campo} text-sm text-tinta-suave`} />
                <div className="flex flex-wrap gap-2">
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(texto)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${boton} text-sm`}
                  >
                    Enviar por WhatsApp
                  </a>
                  <form action={borrarInvitacion}>
                    <input type="hidden" name="hipica_id" value={id} />
                    <input type="hidden" name="invitacion_id" value={inv.id} />
                    <button type="submit" className={botonTexto}>
                      Desactivar
                    </button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      </Seccion>

      <details id="sincuenta" className="group mt-8" open={codigo === "error-sincuenta"}>
        <Resumen>Añadir un alumno sin cuenta</Resumen>
        <form action={anadirSinCuenta} className={`${tarjeta} mt-3 space-y-3 p-4`}>
          <input type="hidden" name="hipica_id" value={id} />
          <p className="text-sm text-tinta-suave">
            Para quien reserva por teléfono o no usa el móvil. Tú le apuntas a las clases y le pones el bono.
          </p>
          <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
            <div className="space-y-1.5">
              <label htmlFor="sc-nombre" className={etiqueta}>
                Nombre y apellido
              </label>
              <input id="sc-nombre" name="nombre" required maxLength={120} className={campo} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="sc-telefono" className={etiqueta}>
                Teléfono <span className="font-normal text-tinta-suave">(opcional)</span>
              </label>
              <input id="sc-telefono" name="telefono" type="tel" maxLength={30} className={campo} />
            </div>
          </div>
          <button type="submit" className={`${boton} w-full`}>
            Añadir alumno
          </button>
        </form>
      </details>

    </PantallaApp>
  );
}
