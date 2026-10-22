import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Columna,
  Columnas,
  Aviso,
  Cabecera,
  CargandoApp,
  Chip,
  Cifras,
  PantallaApp,
  Seccion,
  Vacio,
  boton,
  botonPeligro,
  botonSecundario,
  botonTexto,
  campo,
  etiqueta,
  tarjeta,
} from "@/components/app/ui";
import { SelectAuto } from "@/components/app/select-auto";
import { capitalizar, cargarContexto, fechas, navegacion } from "@/lib/hipica";
import { resumenBono, type EstadoBono } from "@/lib/tipos";
import {
  apuntarAlumno,
  apuntarEspera,
  asignarCaballo,
  cambiarCancelacion,
  marcarAsistencia,
  quitarAlumno,
  quitarEspera,
} from "./actions";

type Sesion = {
  id: string;
  titulo: string;
  inicio: string;
  fin: string;
  plazas: number;
  cancelada: boolean;
  tipo: "grupo" | "particular" | "libre";
  monitor: { nombre: string } | null;
  pista: { nombre: string } | null;
};
type Persona = { id: string; nombre: string; telefono: string | null; titular_id: string | null; rol: string; nivel: string | null };
type Reserva = { id: string; asistio: boolean | null; caballo_id: string | null; desde_espera: boolean; miembro_id: string };
type Espera = { id: string; miembro_id: string };
type Caballo = { id: string; nombre: string; disponible: boolean; max_clases_dia: number; tipo: string; propietario_id: string | null };
type Uso = { caballo_id: string; sesion_id: string; sesiones: { inicio: string } };

const ERRORES: Record<string, string> = {
  apuntar: "No se ha podido apuntar. Puede que la clase se haya llenado.",
  espera: "No se ha podido apuntar a la lista de espera.",
  confirmar: "Marca la casilla para confirmar.",
  caballo: "No se ha podido asignar el caballo.",
  caballo_repetido: "Ese caballo ya está en esta clase. Elige otro.",
};

export default function SesionPage({ params, searchParams }: PageProps<"/hipica/[id]/sesion/[sesionId]">) {
  return (
    <Suspense fallback={<CargandoApp />}>
      <Contenido params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Contenido({ params, searchParams }: PageProps<"/hipica/[id]/sesion/[sesionId]">) {
  const { id, sesionId } = await params;
  const { error: codigoError } = await searchParams;
  const ctx = await cargarContexto(id);
  const { supabase, hipica, esAdmin } = ctx;
  const base = `/hipica/${id}`;
  const f = fechas(hipica.zona_horaria);

  if (!ctx.esStaff) {
    return (
      <PantallaApp
        nav={navegacion(ctx, "horario")}
        cabecera={<Cabecera titulo="Lista de la clase" volver={{ href: `${base}/horario`, texto: "Reservar" }} />}
      >
        <Vacio>Solo la hípica puede ver la lista de alumnos de una clase.</Vacio>
      </PantallaApp>
    );
  }

  const { data: sesion } = await supabase
    .from("sesiones")
    .select("id, titulo, inicio, fin, plazas, cancelada, tipo, monitor:miembros(nombre), pista:pistas(nombre)")
    .eq("id", sesionId)
    .eq("hipica_id", id)
    .maybeSingle<Sesion>();
  if (!sesion) notFound();

  const inicio = new Date(sesion.inicio);
  const [{ data: reservas, error }, { data: esperas }, { data: personas }, { data: caballos }, { data: usos }, { data: bonos }] =
    await Promise.all([
      supabase
        .from("reservas")
        .select("id, asistio, caballo_id, desde_espera, miembro_id")
        .eq("sesion_id", sesionId)
        .eq("estado", "confirmada")
        .order("created_at")
        .returns<Reserva[]>(),
      supabase.from("esperas").select("id, miembro_id").eq("sesion_id", sesionId).order("created_at").returns<Espera[]>(),
      supabase
        .from("miembros")
        .select("id, nombre, telefono, titular_id, rol, nivel")
        .eq("hipica_id", id)
        .eq("activo", true)
        .order("nombre")
        .returns<Persona[]>(),
      supabase
        .from("caballos")
        .select("id, nombre, disponible, max_clases_dia, tipo, propietario_id")
        .eq("hipica_id", id)
        .eq("activo", true)
        .order("nombre")
        .returns<Caballo[]>(),
      // Clases de cada caballo ese mismo día (para no cansarlo).
      supabase
        .from("reservas")
        .select("caballo_id, sesion_id, sesiones!inner(inicio)")
        .eq("hipica_id", id)
        .eq("estado", "confirmada")
        .not("caballo_id", "is", null)
        .gte("sesiones.inicio", new Date(inicio.getTime() - 24 * 36e5).toISOString())
        .lte("sesiones.inicio", new Date(inicio.getTime() + 24 * 36e5).toISOString())
        .returns<Uso[]>(),
      supabase.rpc("estado_bonos", { p_hipica: id }),
    ]);
  if (error) throw new Error(error.message);

  const porId = new Map((personas ?? []).map((p) => [p.id, p]));
  const bonoDe = new Map(((bonos ?? []) as EstadoBono[]).map((b) => [b.miembro_id, b]));
  const hoy = f.clave(new Date());
  const lista = (reservas ?? []).sort((a, b) =>
    (porId.get(a.miembro_id)?.nombre ?? "").localeCompare(porId.get(b.miembro_id)?.nombre ?? "", "es"),
  );
  const enEspera = esperas ?? [];
  const ocupadas = lista.length;
  const libres = Math.max(sesion.plazas - ocupadas, 0);
  const ahora = new Date();
  const empezada = inicio <= ahora;
  const vinieron = lista.filter((r) => r.asistio === true).length;
  const conCaballos = sesion.tipo !== "libre";
  const limpiar = typeof codigoError === "string" ? "1" : "";

  // Clases que tiene cada caballo ese día, sin contar esta.
  const dia = f.clave(inicio);
  const otras = new Map<string, number>();
  for (const u of usos ?? []) {
    if (u.sesion_id === sesionId || f.clave(u.sesiones.inicio) !== dia) continue;
    otras.set(u.caballo_id, (otras.get(u.caballo_id) ?? 0) + 1);
  }

  const ocultos = (extra: Record<string, string> = {}) => (
    <>
      <input type="hidden" name="hipica_id" value={id} />
      <input type="hidden" name="sesion_id" value={sesionId} />
      {limpiar && <input type="hidden" name="limpiar" value="1" />}
      {Object.entries(extra).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
    </>
  );

  const apuntados = new Set([...lista.map((r) => r.miembro_id), ...enEspera.map((e) => e.miembro_id)]);
  const disponibles = (personas ?? []).filter((p) => p.rol === "alumno" && !apuntados.has(p.id));
  const mensaje = typeof codigoError === "string" && Object.hasOwn(ERRORES, codigoError) ? ERRORES[codigoError] : null;
  const detalle = [
    `${f.hora(sesion.inicio)}–${f.hora(sesion.fin)}`,
    sesion.pista?.nombre,
    sesion.monitor?.nombre,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <PantallaApp ancho="amplio"
      nav={navegacion(ctx, "horario")}
      cabecera={
        <Cabecera
          volver={{ href: `${base}/horario?dia=${dia}`, texto: "Clases" }}
          antetitulo={capitalizar(f.largo(inicio))}
          titulo={sesion.cancelada ? `${sesion.titulo} (cancelada)` : sesion.titulo}
          detalle={detalle}
        >
          <Cifras
            items={[
              { valor: `${ocupadas}/${sesion.plazas}`, texto: "plazas" },
              { valor: vinieron, texto: vinieron === 1 ? "ha venido" : "han venido" },
              { valor: enEspera.length, texto: "en espera" },
            ]}
          />
        </Cabecera>
      }
    >
      {mensaje && (
        <div className="mb-5">
          <Aviso tipo="error">{mensaje}</Aviso>
        </div>
      )}

      <Columnas className="lg:grid-cols-[3fr_2fr]">
        <Columna>
      <Seccion titulo={conCaballos ? "Alumnos y caballos" : "Jinetes"} id="alumnos">
        {lista.length === 0 ? (
          <Vacio>Nadie ha reservado todavía.</Vacio>
        ) : (
          <ul className={`${tarjeta} divide-y divide-linea overflow-hidden`}>
            {lista.map((r) => {
              const p = porId.get(r.miembro_id);
              const titular = p?.titular_id ? porId.get(p.titular_id) : null;
              const telefono = p?.telefono ?? titular?.telefono;
              const bono = bonoDe.get(r.miembro_id);
              const rb = bono ? resumenBono(bono, hoy) : null;
              const enEsta = new Set(lista.filter((x) => x.id !== r.id && x.caballo_id).map((x) => x.caballo_id));
              return (
                <li key={r.id} className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                    <div className="min-w-0">
                      <Link href={`${base}/miembros/${r.miembro_id}`} className="font-bold hover:underline">
                        {p?.nombre ?? "Alumno"}
                      </Link>
                      <p className="text-sm text-tinta-suave">
                        {[p?.nivel, titular && `de ${titular.nombre}`].filter(Boolean).join(" · ")}
                        {telefono && (
                          <>
                            {(p?.nivel || titular) && " · "}
                            <a href={`tel:${telefono}`} className="underline">
                              {telefono}
                            </a>
                          </>
                        )}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1.5 empty:hidden">
                        {sesion.tipo === "grupo" && rb && (rb.renovar || !bono?.bono_id) && <Chip tono={rb.tono}>{rb.texto}</Chip>}
                        {r.desde_espera && <Chip tono="info">Entró desde la espera</Chip>}
                      </div>
                    </div>
                    <form action={marcarAsistencia} className="flex gap-2" aria-label={`Asistencia de ${p?.nombre ?? "alumno"}`}>
                      {ocultos({ reserva_id: r.id })}
                      <button
                        type="submit"
                        name="asistio"
                        value={r.asistio === true ? "nada" : "si"}
                        aria-pressed={r.asistio === true}
                        className={`inline-flex min-h-11 items-center rounded-xl border px-3 text-sm font-bold ${
                          r.asistio === true ? "border-cuadra bg-cuadra text-white" : "border-linea bg-white hover:border-tinta-suave"
                        }`}
                      >
                        Vino
                      </button>
                      <button
                        type="submit"
                        name="asistio"
                        value={r.asistio === false ? "nada" : "no"}
                        aria-pressed={r.asistio === false}
                        className={`inline-flex min-h-11 items-center rounded-xl border px-3 text-sm font-bold ${
                          r.asistio === false ? "border-alerta bg-alerta text-white" : "border-linea bg-white hover:border-tinta-suave"
                        }`}
                      >
                        No vino
                      </button>
                    </form>
                  </div>

                  {conCaballos && !sesion.cancelada && (
                    <form action={asignarCaballo}>
                      {ocultos({ reserva_id: r.id })}
                      <SelectAuto
                        id={`caballo-${r.id}`}
                        name="caballo_id"
                        label={`Caballo de ${p?.nombre ?? "este alumno"}`}
                        defaultValue={r.caballo_id ?? ""}
                        opciones={[
                          { valor: "", texto: r.caballo_id ? "Quitar caballo" : "Sin caballo asignado" },
                          ...(caballos ?? []).map((c) => {
                            const n = otras.get(c.id) ?? 0;
                            const suyo = c.propietario_id && (c.propietario_id === r.miembro_id || c.propietario_id === p?.titular_id);
                            let texto = c.tipo === "propietario" ? `${c.nombre} (${suyo ? "su caballo" : "de propietario"})` : c.nombre;
                            if (enEsta.has(c.id)) texto += " · ya en esta clase";
                            else if (!c.disponible) texto += " · en reposo";
                            else if (n >= c.max_clases_dia) texto += ` · ya tiene ${n} clases (máx. ${c.max_clases_dia})`;
                            else if (n > 0) texto += ` · ${n === 1 ? "1 clase más" : `${n} clases más`} ese día`;
                            return {
                              valor: c.id,
                              texto,
                              deshabilitada: c.id !== r.caballo_id && (enEsta.has(c.id) || !c.disponible),
                            };
                          }),
                        ]}
                      />
                    </form>
                  )}

                  {esAdmin && !empezada && (
                    <form action={quitarAlumno} className="-my-2 text-right">
                      {ocultos({ reserva_id: r.id })}
                      <button type="submit" className={botonTexto}>
                        Quitar de la clase
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {conCaballos && (caballos ?? []).length === 0 && lista.length > 0 && (
          <p className="mt-3 text-sm text-tinta-suave">
            Da de alta los caballos de la escuela en la pestaña Caballos para poder asignarlos.
          </p>
        )}
      </Seccion>

        </Columna>
        <Columna>
      {(enEspera.length > 0 || (libres === 0 && !empezada && !sesion.cancelada)) && (
        <Seccion titulo="Lista de espera" id="espera">
          {enEspera.length === 0 ? (
            <Vacio>Nadie espera plaza. Si alguien anula, entrará el primero de la lista.</Vacio>
          ) : (
            <ol className={`${tarjeta} divide-y divide-linea overflow-hidden`}>
              {enEspera.map((e, i) => {
                const p = porId.get(e.miembro_id);
                return (
                  <li key={e.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-info-suave text-sm font-extrabold text-info">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 font-bold">{p?.nombre ?? "Alumno"}</span>
                    {esAdmin && libres > 0 && !empezada && (
                      <form action={apuntarAlumno}>
                        {ocultos({ miembro_id: e.miembro_id })}
                        <button type="submit" className={`${botonSecundario} px-3 text-sm`}>
                          Pasar a la clase
                        </button>
                      </form>
                    )}
                    {esAdmin && (
                      <form action={quitarEspera}>
                        {ocultos({ espera_id: e.id })}
                        <button type="submit" className={botonTexto}>
                          Quitar
                        </button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </Seccion>
      )}

      {esAdmin && !empezada && !sesion.cancelada && disponibles.length > 0 && (
        <Seccion titulo={libres > 0 ? "Apuntar a un alumno" : "Apuntar a la lista de espera"} id="apuntar">
          <form action={libres > 0 ? apuntarAlumno : apuntarEspera} className={`${tarjeta} space-y-3 p-4`}>
            {ocultos()}
            <div className="space-y-1.5">
              <label htmlFor="miembro_id" className={etiqueta}>
                Alumno
              </label>
              <select id="miembro_id" name="miembro_id" required className={campo}>
                {disponibles.map((p) => {
                  const titular = p.titular_id ? porId.get(p.titular_id) : null;
                  return (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                      {titular ? ` (de ${titular.nombre})` : ""}
                      {p.nivel ? ` · ${p.nivel}` : ""}
                    </option>
                  );
                })}
              </select>
            </div>
            <button type="submit" className={`${boton} w-full`}>
              {libres > 0 ? "Apuntar" : "Apuntar a la espera"}
            </button>
            {sesion.tipo === "grupo" && (
              <p className="text-sm text-tinta-suave">Si tiene bono, se le descuenta una clase.</p>
            )}
          </form>
        </Seccion>
      )}

      {esAdmin && !empezada && (
        <Seccion titulo={sesion.cancelada ? "Clase cancelada" : "Cancelar esta clase"} id="cancelar">
          <div className={`${tarjeta} space-y-3 p-4`}>
            {sesion.cancelada ? (
              <>
                <p className="text-sm">Los alumnos la ven como cancelada y no se les descuenta del bono.</p>
                <form action={cambiarCancelacion}>
                  {ocultos({ cancelada: "false" })}
                  <button type="submit" className={botonSecundario}>
                    Reactivar clase
                  </button>
                </form>
              </>
            ) : (
              <>
                <p className="text-sm text-tinta-suave">
                  Solo este día; las demás semanas siguen igual. No se descuenta del bono. Avisa a los alumnos por
                  WhatsApp: por ahora la app no manda mensajes.
                </p>
                <form action={cambiarCancelacion} className="space-y-3">
                  {ocultos({ cancelada: "true" })}
                  <label className="flex min-h-11 items-center gap-3 text-sm">
                    <input type="checkbox" name="confirmar" value="si" required className="size-5 accent-alerta" />
                    Sí, quiero cancelar la clase de este día
                  </label>
                  <button type="submit" className={botonPeligro}>
                    Cancelar clase
                  </button>
                </form>
              </>
            )}
          </div>
        </Seccion>
      )}
        </Columna>
      </Columnas>
    </PantallaApp>
  );
}
