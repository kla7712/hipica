import { Suspense } from "react";
import { headers } from "next/headers";
import {
  Resumen,
  Aviso,
  Cabecera,
  CargandoApp,
  Chip,
  Inicial,
  PantallaApp,
  Seccion,
  Vacio,
  boton,
  botonSecundario,
  botonTexto,
  campo,
  etiqueta,
  tarjeta,
} from "@/components/app/ui";
import { cargarContexto, navegacion, OFICIOS, ROLES, type Rol } from "@/lib/hipica";
import { bajaEquipo, borrarInvitacionEquipo, borrarProfesional, crearProfesional, invitarEquipo } from "../gestion/actions";

type Persona = { id: string; nombre: string; rol: Rol; telefono: string | null; user_id: string | null };
type Invitacion = { id: string; rol: string; token: string; expira_en: string; usos: number };
type Profesional = { id: string; nombre: string; oficio: string; telefono: string | null; nota: string | null };

const MENSAJES: Record<string, { tipo: "ok" | "error"; texto: string }> = {
  baja: { tipo: "ok", texto: "Dado de baja. Ya no puede entrar en la hípica." },
  profesional: { tipo: "ok", texto: "Profesional añadido." },
  "error-baja": { tipo: "error", texto: "No se ha podido dar de baja." },
  "error-invitar": { tipo: "error", texto: "No se ha podido crear la invitación." },
  "error-profesional": { tipo: "error", texto: "Revisa el nombre y el teléfono." },
};

const QUE_HACE: Record<string, string> = {
  admin: "Lo ve y lo gestiona todo",
  monitor: "Clases, alumnos de cada clase, caballos y cuadra",
  cuadra: "Tareas de cuadra, almacén y caballos. No ve alumnos ni clases",
};

export default function EquipoPage({ params, searchParams }: PageProps<"/hipica/[id]/equipo">) {
  return (
    <Suspense fallback={<CargandoApp />}>
      <Contenido params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Contenido({ params, searchParams }: PageProps<"/hipica/[id]/equipo">) {
  const { id } = await params;
  const q = await searchParams;
  const ctx = await cargarContexto(id);
  const { supabase, hipica, esAdmin } = ctx;
  const nav = navegacion(ctx, "gestion");
  const volver = { href: `/hipica/${id}/gestion`, texto: "Gestión" };

  if (!ctx.esEquipo) {
    return (
      <PantallaApp nav={nav} cabecera={<Cabecera titulo="Equipo" volver={volver} />}>
        <Vacio>Esta sección es para el equipo de la hípica.</Vacio>
      </PantallaApp>
    );
  }

  const ahora = new Date().toISOString();
  const [{ data: equipo }, { data: invitaciones }, { data: profesionales }] = await Promise.all([
    supabase
      .from("miembros")
      .select("id, nombre, rol, telefono, user_id")
      .eq("hipica_id", id)
      .eq("activo", true)
      .neq("rol", "alumno")
      .order("rol")
      .order("nombre")
      .returns<Persona[]>(),
    esAdmin
      ? supabase
          .from("invitaciones")
          .select("id, rol, token, expira_en, usos")
          .eq("hipica_id", id)
          .in("rol", ["monitor", "cuadra"])
          .eq("usos", 0)
          .gt("expira_en", ahora)
          .order("created_at", { ascending: false })
          .returns<Invitacion[]>()
      : Promise.resolve({ data: [] as Invitacion[] }),
    supabase.from("profesionales").select("id, nombre, oficio, telefono, nota").eq("hipica_id", id).order("oficio").returns<Profesional[]>(),
  ]);

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  const codigo = typeof q.ok === "string" ? q.ok : typeof q.error === "string" ? `error-${q.error}` : null;
  const mensaje = codigo && Object.hasOwn(MENSAJES, codigo) ? MENSAJES[codigo] : null;

  return (
    <PantallaApp
      nav={esAdmin ? nav : navegacion(ctx, null)}
      cabecera={<Cabecera volver={esAdmin ? volver : undefined} antetitulo={hipica.nombre} titulo="Equipo" demo={ctx.demo} />}
    >
      {mensaje && (
        <div className="mb-5">
          <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso>
        </div>
      )}

      <Seccion titulo="Usan la app" id="equipo">
        <ul className={`${tarjeta} divide-y divide-linea overflow-hidden`}>
          {(equipo ?? []).map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Inicial nombre={m.nombre} tono="verde" />
              <span className="min-w-0 flex-1">
                <span className="block font-bold">
                  {m.nombre}
                  {m.user_id === ctx.userId && " (tú)"}
                </span>
                <span className="block text-sm text-tinta-suave">{QUE_HACE[m.rol] ?? ""}</span>
              </span>
              <Chip tono={m.rol === "admin" ? "ok" : "neutro"}>{ROLES[m.rol]}</Chip>
              {esAdmin && m.rol !== "admin" && (
                <details className="w-full text-right text-sm">
                  <summary className={`${botonTexto} cursor-pointer list-none hover:text-alerta`}>Dar de baja</summary>
                  <form action={bajaEquipo} className="mt-2 space-y-2 rounded-xl bg-alerta-suave p-3 text-left">
                    <input type="hidden" name="hipica_id" value={id} />
                    <input type="hidden" name="miembro_id" value={m.id} />
                    <p className="text-alerta">{m.nombre} dejará de ver la hípica.</p>
                    <button type="submit" className="inline-flex min-h-11 items-center rounded-xl bg-alerta px-4 font-bold text-white">
                      Confirmar baja
                    </button>
                  </form>
                </details>
              )}
            </li>
          ))}
        </ul>
      </Seccion>

      {esAdmin && (
        <Seccion titulo="Invitar al equipo" id="invitar">
          <div className={`${tarjeta} space-y-3 p-4`}>
            <p className="text-sm text-tinta-suave">
              Cada enlace sirve para una sola persona y caduca en 7 días. Mándalo por WhatsApp.
            </p>
            <div className="flex flex-wrap gap-2">
              <form action={invitarEquipo} className="flex-1">
                <input type="hidden" name="hipica_id" value={id} />
                <input type="hidden" name="rol" value="monitor" />
                <button type="submit" className={`${boton} w-full`}>
                  Invitar a un monitor
                </button>
              </form>
              <form action={invitarEquipo} className="flex-1">
                <input type="hidden" name="hipica_id" value={id} />
                <input type="hidden" name="rol" value="cuadra" />
                <button type="submit" className={`${botonSecundario} w-full`}>
                  Invitar a cuadra
                </button>
              </form>
            </div>
            {(invitaciones ?? []).map((inv) => {
              const url = `${proto}://${host}/unirse/${inv.token}`;
              const texto = `Te invito al equipo de ${hipica.nombre} en la app de la hípica: ${url}`;
              return (
                <div key={inv.id} className="space-y-2 rounded-xl bg-limo p-3">
                  <p className="text-sm font-bold">Enlace para {inv.rol === "monitor" ? "un monitor" : "cuadra"}</p>
                  <label className="sr-only" htmlFor={`url-${inv.id}`}>
                    Enlace
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
                    <form action={borrarInvitacionEquipo}>
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
      )}

      <Seccion titulo="Profesionales" id="profesionales">
        {(profesionales ?? []).length === 0 ? (
          <Vacio>Apunta aquí al veterinario, al herrador… para tener su teléfono a mano.</Vacio>
        ) : (
          <ul className={`${tarjeta} divide-y divide-linea overflow-hidden`}>
            {(profesionales ?? []).map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Inicial nombre={p.nombre} />
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{p.nombre}</span>
                  <span className="block text-sm text-tinta-suave">{[OFICIOS[p.oficio], p.nota].filter(Boolean).join(" · ")}</span>
                </span>
                {p.telefono && (
                  <a href={`tel:${p.telefono}`} className={`${botonSecundario} px-3 text-sm`} aria-label={`Llamar a ${p.nombre}`}>
                    Llamar
                  </a>
                )}
                {esAdmin && (
                  <form action={borrarProfesional}>
                    <input type="hidden" name="hipica_id" value={id} />
                    <input type="hidden" name="profesional_id" value={p.id} />
                    <button type="submit" className={`${botonTexto} hover:text-alerta`} aria-label={`Quitar a ${p.nombre}`}>
                      Quitar
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        {esAdmin && (
          <details className={`${tarjeta} mt-3 p-4 group`}>
            <Resumen>Añadir un profesional</Resumen>
            <form action={crearProfesional} className="mt-3 space-y-3">
              <input type="hidden" name="hipica_id" value={id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="p-nombre" className={etiqueta}>
                    Nombre
                  </label>
                  <input id="p-nombre" name="nombre" required maxLength={80} className={campo} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="p-oficio" className={etiqueta}>
                    Qué hace
                  </label>
                  <select id="p-oficio" name="oficio" className={campo}>
                    {Object.entries(OFICIOS).map(([v, t]) => (
                      <option key={v} value={v}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="p-tel" className={etiqueta}>
                    Teléfono
                  </label>
                  <input id="p-tel" name="telefono" type="tel" maxLength={30} className={campo} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="p-nota" className={etiqueta}>
                    Nota <span className="font-normal text-tinta-suave">(opcional)</span>
                  </label>
                  <input id="p-nota" name="nota" maxLength={120} placeholder="Ej.: cada 6 semanas" className={campo} />
                </div>
              </div>
              <button type="submit" className={`${boton} w-full`}>
                Añadir
              </button>
            </form>
          </details>
        )}
      </Seccion>
    </PantallaApp>
  );
}
