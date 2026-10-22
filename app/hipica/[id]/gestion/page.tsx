import { Suspense } from "react";
import Link from "next/link";
import {
  Aviso,
  Cabecera,
  CargandoApp,
  Chip,
  Cifras,
  Icono,
  PantallaApp,
  Seccion,
  Vacio,
  boton,
  botonSecundario,
  tarjeta,
} from "@/components/app/ui";
import { cargarContexto, navegacion, PUPILAJES, type Contexto } from "@/lib/hipica";
import { revisarAlta } from "./actions";

type Alta = {
  id: string;
  nombre: string;
  telefono: string | null;
  jinetes: { nombre: string; yo: boolean; nivel?: string; edad?: number }[];
  caballo: { nombre: string; raza?: string; nacimiento?: number; pupilaje?: string; entrada?: string } | null;
  nota: string | null;
  created_at: string;
};

const MENSAJES: Record<string, { tipo: "ok" | "error"; texto: string }> = {
  aprobada: { tipo: "ok", texto: "Alta aprobada. Ya puede entrar en la app y reservar." },
  rechazada: { tipo: "ok", texto: "Alta rechazada." },
  "error-alta": { tipo: "error", texto: "No se ha podido revisar el alta. Vuelve a intentarlo." },
};

export default function GestionPage({ params, searchParams }: PageProps<"/hipica/[id]/gestion">) {
  return (
    <Suspense fallback={<CargandoApp />}>
      <Contenido params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Contenido({ params, searchParams }: PageProps<"/hipica/[id]/gestion">) {
  const { id } = await params;
  const q = await searchParams;
  const ctx = await cargarContexto(id);
  const codigo = typeof q.ok === "string" ? q.ok : typeof q.error === "string" ? `error-${q.error}` : null;
  const mensaje = codigo && Object.hasOwn(MENSAJES, codigo) ? MENSAJES[codigo] : null;
  if (!ctx.esAdmin) {
    return (
      <PantallaApp nav={navegacion(ctx, "gestion")} cabecera={<Cabecera antetitulo={ctx.hipica.nombre} titulo="Gestión" />}>
        <Vacio>Solo el administrador puede ver la gestión de la hípica.</Vacio>
      </PantallaApp>
    );
  }
  return <Gestion ctx={ctx} mensaje={mensaje} />;
}

async function Gestion({ ctx, mensaje }: { ctx: Contexto; mensaje: { tipo: "ok" | "error"; texto: string } | null }) {
  const { supabase, hipica } = ctx;
  const base = `/hipica/${hipica.id}`;
  const [{ data: altas }, { data: datos }, { data: boxes }, { count: equipo }] = await Promise.all([
    supabase
      .from("altas")
      .select("id, nombre, telefono, jinetes, caballo, nota, created_at")
      .eq("hipica_id", hipica.id)
      .eq("estado", "pendiente")
      .order("created_at")
      .returns<Alta[]>(),
    supabase.from("hipicas").select("num_boxes, revisar_altas").eq("id", hipica.id).single<{ num_boxes: number; revisar_altas: boolean }>(),
    supabase.from("caballos").select("box").eq("hipica_id", hipica.id).eq("activo", true).not("box", "is", null).returns<{ box: string }[]>(),
    supabase.from("miembros").select("id", { count: "exact", head: true }).eq("hipica_id", hipica.id).eq("activo", true).neq("rol", "alumno"),
  ]);
  const ocupados = new Set((boxes ?? []).map((b) => b.box.trim()));
  const total = datos?.num_boxes ?? 0;
  const libres = total ? Array.from({ length: total }, (_, i) => String(i + 1)).filter((b) => !ocupados.has(b)).length : null;
  const fFecha = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: hipica.zona_horaria });

  const enlaces: { href: string; titulo: string; detalle: string }[] = [
    { href: `${base}/miembros`, titulo: "Alumnos", detalle: "Fichas, niveles, bonos e invitaciones" },
    { href: `${base}/equipo`, titulo: "Equipo y profesionales", detalle: "Monitores, cuadra, veterinario, herrador…" },
    { href: `${base}/clases`, titulo: "Horario semanal", detalle: "Crear clases y publicar el calendario" },
    { href: `${base}/servicios`, titulo: "Servicios pedidos", detalle: "Lo que piden los propietarios" },
    { href: `${base}/ajustes`, titulo: "Ajustes", detalle: "Normas, pistas, boxes y servicios" },
  ];

  return (
    <PantallaApp
      nav={navegacion(ctx, "gestion")}
      cabecera={
        <Cabecera antetitulo={hipica.nombre} titulo="Gestión" demo={ctx.demo}>
          <Cifras
            items={[
              { valor: (altas ?? []).length, texto: "altas por revisar", href: "#altas" },
              { valor: libres === null ? "–" : `${libres}/${total}`, texto: "boxes libres", href: `${base}/caballos#boxes` },
              { valor: equipo ?? 0, texto: "en el equipo", href: `${base}/equipo` },
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

      <Seccion titulo="Altas por revisar" id="altas">
        {(altas ?? []).length === 0 ? (
          <Vacio>
            {datos?.revisar_altas
              ? "No hay altas pendientes. Las que hagan las familias con el enlace de alumnos aparecen aquí."
              : "Las familias entran directamente con el enlace de alumnos. Si prefieres revisarlas antes, actívalo en Ajustes."}
          </Vacio>
        ) : (
          <ul className="space-y-2.5">
            {(altas ?? []).map((a) => {
              const montan = a.jinetes.map((j) =>
                [j.yo ? `${j.nombre} (titular)` : j.nombre, j.edad && `${j.edad} años`, j.nivel].filter(Boolean).join(" · "),
              );
              return (
                <li key={a.id} className={`${tarjeta} space-y-2 p-4`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold">{a.nombre}</p>
                      <p className="text-sm text-tinta-suave">
                        {fFecha.format(new Date(a.created_at))}
                        {a.telefono && (
                          <>
                            {" · "}
                            <a href={`tel:${a.telefono}`} className="underline">
                              {a.telefono}
                            </a>
                          </>
                        )}
                      </p>
                    </div>
                    <Chip tono={a.caballo ? "ok" : "info"}>{a.caballo ? "Pupilaje" : "Clases"}</Chip>
                  </div>
                  {montan.length > 0 && (
                    <p className="text-sm">
                      <span className="font-semibold">Monta{montan.length > 1 ? "n" : ""}: </span>
                      {montan.join("; ")}
                    </p>
                  )}
                  {a.caballo && (
                    <p className="text-sm">
                      <span className="font-semibold">Caballo: </span>
                      {[
                        a.caballo.nombre,
                        a.caballo.raza,
                        a.caballo.nacimiento && `nacido en ${a.caballo.nacimiento}`,
                        a.caballo.pupilaje && PUPILAJES[a.caballo.pupilaje],
                        a.caballo.entrada && `entra el ${new Date(a.caballo.entrada).toLocaleDateString("es-ES", { timeZone: "UTC" })}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                  {a.nota && <p className="rounded-xl bg-limo px-3 py-2 text-sm">{a.nota}</p>}
                  <div className="flex gap-2 pt-1">
                    <form action={revisarAlta} className="flex-1">
                      <input type="hidden" name="hipica_id" value={hipica.id} />
                      <input type="hidden" name="alta_id" value={a.id} />
                      <input type="hidden" name="aprobar" value="true" />
                      <button type="submit" className={`${boton} w-full`}>
                        Aprobar
                      </button>
                    </form>
                    <form action={revisarAlta} className="flex-1">
                      <input type="hidden" name="hipica_id" value={hipica.id} />
                      <input type="hidden" name="alta_id" value={a.id} />
                      <input type="hidden" name="aprobar" value="false" />
                      <button type="submit" className={`${botonSecundario} w-full`}>
                        Rechazar
                      </button>
                    </form>
                  </div>
                  <p className="text-xs text-tinta-suave">
                    Al aprobar se crean sus fichas{a.caballo ? " y la de su caballo (sin box: asígnalo en su ficha)" : ""}. El nivel es
                    el que han indicado; cámbialo si hace falta.
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Seccion>

      <Seccion titulo="La hípica" id="menu">
        <ul className={`${tarjeta} divide-y divide-linea overflow-hidden`}>
          {enlaces.map((e) => (
            <li key={e.href}>
              <Link href={e.href} className="flex items-center gap-3 px-4 py-4 hover:bg-limo">
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{e.titulo}</span>
                  <span className="block text-sm text-tinta-suave">{e.detalle}</span>
                </span>
                <Icono nombre="flecha" className="size-5 text-tinta-suave" />
              </Link>
            </li>
          ))}
        </ul>
      </Seccion>
    </PantallaApp>
  );
}
