import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Aviso,
  Cabecera,
  CargandoApp,
  CasillaFecha,
  Chip,
  Icono,
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
import { cargarContexto, fechas, navegacion, NIVELES } from "@/lib/hipica";
import { UUID } from "@/lib/rutas";
import { resumenBono } from "@/lib/tipos";
import { borrarBono, cambiarNivel, crearBono, darDeBaja, editarDatos } from "../actions";

type Miembro = {
  id: string;
  nombre: string;
  telefono: string | null;
  nivel: string | null;
  rol: string;
  user_id: string | null;
  titular_id: string | null;
};
type Bono = { id: string; clases: number; caduca: string | null; nota: string | null; created_at: string };
type Reserva = { id: string; bono_id: string | null; sesiones: { titulo: string; inicio: string; cancelada: boolean } };

const MENSAJES: Record<string, { tipo: "ok" | "error"; texto: string }> = {
  creado: { tipo: "ok", texto: "Alumno añadido. Ponle su nivel y su bono si tiene." },
  nivel: { tipo: "ok", texto: "Nivel guardado." },
  datos: { tipo: "ok", texto: "Datos guardados." },
  bono: { tipo: "ok", texto: "Bono añadido. Ya puede reservar con él." },
  bonoborrado: { tipo: "ok", texto: "Bono borrado." },
  "error-nivel": { tipo: "error", texto: "No se ha podido guardar el nivel." },
  "error-datos": { tipo: "error", texto: "Revisa el nombre y el teléfono." },
  "error-bono": { tipo: "error", texto: "No se ha podido añadir el bono." },
};

export default function FichaPage({ params, searchParams }: PageProps<"/hipica/[id]/miembros/[miembroId]">) {
  return (
    <Suspense fallback={<CargandoApp />}>
      <Contenido params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Contenido({ params, searchParams }: PageProps<"/hipica/[id]/miembros/[miembroId]">) {
  const { id, miembroId } = await params;
  const { ok, error: codigoError } = await searchParams;
  if (!UUID.test(miembroId)) notFound();
  const ctx = await cargarContexto(id);
  const { supabase, hipica, esAdmin } = ctx;
  const base = `/hipica/${id}`;
  const f = fechas(hipica.zona_horaria);
  const nav = navegacion(ctx, esAdmin ? "miembros" : "horario");

  if (!ctx.esStaff) notFound();

  const { data: m } = await supabase
    .from("miembros")
    .select("id, nombre, telefono, nivel, rol, user_id, titular_id")
    .eq("id", miembroId)
    .eq("hipica_id", id)
    .eq("activo", true)
    .maybeSingle<Miembro>();
  if (!m) notFound();

  const ahora = new Date();
  const [{ data: titular }, { data: aCargo }, { data: bonos }, { data: reservas }] = await Promise.all([
    m.titular_id
      ? supabase.from("miembros").select("id, nombre, telefono").eq("id", m.titular_id).maybeSingle<{ id: string; nombre: string; telefono: string | null }>()
      : Promise.resolve({ data: null }),
    supabase
      .from("miembros")
      .select("id, nombre, nivel")
      .eq("titular_id", m.id)
      .eq("activo", true)
      .order("nombre")
      .returns<{ id: string; nombre: string; nivel: string | null }[]>(),
    supabase
      .from("bonos")
      .select("id, clases, caduca, nota, created_at")
      .eq("miembro_id", m.id)
      .order("created_at", { ascending: false })
      .returns<Bono[]>(),
    supabase
      .from("reservas")
      .select("id, bono_id, sesiones!inner(titulo, inicio, cancelada)")
      .eq("miembro_id", m.id)
      .eq("estado", "confirmada")
      .returns<Reserva[]>(),
  ]);

  const hoy = f.clave(ahora);
  const usadas = new Map<string, number>();
  for (const r of reservas ?? []) {
    if (r.bono_id && !r.sesiones.cancelada) usadas.set(r.bono_id, (usadas.get(r.bono_id) ?? 0) + 1);
  }
  const proximas = (reservas ?? [])
    .filter((r) => new Date(r.sesiones.inicio) > ahora)
    .sort((a, b) => a.sesiones.inicio.localeCompare(b.sesiones.inicio))
    .slice(0, 8);
  const telefono = m.telefono ?? titular?.telefono ?? null;
  const fFecha = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const niveles = m.nivel && !NIVELES.includes(m.nivel) ? [m.nivel, ...NIVELES] : NIVELES;
  const codigo = typeof ok === "string" ? ok : typeof codigoError === "string" ? `error-${codigoError}` : null;
  const mensaje = codigo && Object.hasOwn(MENSAJES, codigo) ? MENSAJES[codigo] : null;
  const ocultos = (
    <>
      <input type="hidden" name="hipica_id" value={id} />
      <input type="hidden" name="miembro_id" value={m.id} />
    </>
  );
  const esAlumno = m.rol === "alumno";

  return (
    <PantallaApp
      nav={nav}
      cabecera={
        <Cabecera
          volver={esAdmin ? { href: `${base}/miembros`, texto: "Alumnos" } : { href: `${base}/horario`, texto: "Clases" }}
          titulo={m.nombre}
          detalle={[
            m.nivel,
            titular && `a cargo de ${titular.nombre}`,
            !m.user_id && !m.titular_id && "sin cuenta en la app",
          ]
            .filter(Boolean)
            .join(" · ")}
        >
          {telefono && (
            <a
              href={`tel:${telefono}`}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white/10 px-4 font-bold hover:bg-white/15"
            >
              Llamar · {telefono}
            </a>
          )}
        </Cabecera>
      }
    >
      {mensaje && (
        <div className="mb-5">
          <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso>
        </div>
      )}

      {esAlumno && (
        <Seccion titulo="Nivel" id="s-nivel">
          <form action={cambiarNivel} className={`${tarjeta} flex flex-wrap items-end gap-3 p-4`}>
            {ocultos}
            <div className="min-w-0 flex-1 basis-48 space-y-1.5">
              <label htmlFor="nivel" className={etiqueta}>
                Nivel del jinete
              </label>
              <select id="nivel" name="nivel" defaultValue={m.nivel ?? ""} className={campo}>
                <option value="">Sin nivel</option>
                {niveles.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className={boton}>
              Guardar
            </button>
          </form>
        </Seccion>
      )}

      {esAlumno && (
        <Seccion titulo="Bonos" id="s-bonos">
          <div className="space-y-3">
            {(bonos ?? []).length === 0 ? (
              <Vacio>No tiene bonos.</Vacio>
            ) : (
              <ul className={`${tarjeta} divide-y divide-linea overflow-hidden`}>
                {(bonos ?? []).map((b) => {
                  const r = resumenBono({ bono_id: b.id, clases: b.clases, usadas: usadas.get(b.id) ?? 0, caduca: b.caduca }, hoy);
                  return (
                    <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold">Bono de {b.clases} clases</span>
                        <span className="block text-sm text-tinta-suave">
                          {[
                            `Desde el ${fFecha.format(new Date(b.created_at))}`,
                            b.caduca ? `caduca el ${fFecha.format(new Date(b.caduca))}` : "sin caducidad",
                            b.nota,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <Chip tono={r.tono}>{r.texto}</Chip>
                      {esAdmin && (
                        <form action={borrarBono}>
                          {ocultos}
                          <input type="hidden" name="bono_id" value={b.id} />
                          <button type="submit" className={`${botonTexto} hover:text-alerta`} aria-label={`Borrar bono de ${b.clases} clases`}>
                            Borrar
                          </button>
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {esAdmin && (
              <details className={`${tarjeta} p-4`} open={(bonos ?? []).length === 0}>
                <summary className="flex min-h-11 cursor-pointer list-none items-center font-bold text-cuadra">
                  + Añadir un bono
                </summary>
                <form action={crearBono} className="mt-3 space-y-3">
                  {ocultos}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label htmlFor="clases" className={etiqueta}>
                        Clases
                      </label>
                      <select id="clases" name="clases" defaultValue="8" className={campo}>
                        {[1, 4, 5, 8, 10, 12, 16, 20].map((n) => (
                          <option key={n} value={n}>
                            {n === 1 ? "1 clase suelta" : `${n} clases`}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="meses" className={etiqueta}>
                        Caduca
                      </label>
                      <select id="meses" name="meses" defaultValue="2" className={campo}>
                        <option value="0">Nunca</option>
                        <option value="1">En 1 mes</option>
                        <option value="2">En 2 meses</option>
                        <option value="3">En 3 meses</option>
                        <option value="6">En 6 meses</option>
                        <option value="12">En 1 año</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="nota" className={etiqueta}>
                      Nota <span className="font-normal text-tinta-suave">(opcional)</span>
                    </label>
                    <input id="nota" name="nota" maxLength={120} placeholder="Ej.: pagado en efectivo" className={campo} />
                  </div>
                  <button type="submit" className={`${boton} w-full`}>
                    Añadir bono
                  </button>
                  <p className="text-sm text-tinta-suave">
                    Cada clase de grupo que reserve gasta una. Si anula a tiempo o cancelas la clase, la recupera.
                  </p>
                </form>
              </details>
            )}
          </div>
        </Seccion>
      )}

      {esAlumno && (
        <Seccion titulo="Próximas clases" id="s-clases">
          {proximas.length === 0 ? (
            <Vacio>No tiene clases reservadas.</Vacio>
          ) : (
            <ul className={`${tarjeta} divide-y divide-linea overflow-hidden`}>
              {proximas.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                  <CasillaFecha
                    corto={f.clave(r.sesiones.inicio) === hoy ? "Hoy" : f.corto(r.sesiones.inicio)}
                    numero={f.numero(r.sesiones.inicio)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className={`block font-bold ${r.sesiones.cancelada ? "text-tinta-suave line-through" : ""}`}>
                      {r.sesiones.titulo}
                    </span>
                    <span className="block text-sm text-tinta-suave">{f.hora(r.sesiones.inicio)}</span>
                  </span>
                  {r.sesiones.cancelada && <Chip tono="alerta">Cancelada</Chip>}
                </li>
              ))}
            </ul>
          )}
        </Seccion>
      )}

      {(aCargo ?? []).length > 0 && (
        <Seccion titulo="Jinetes a su cargo" id="s-familia">
          <ul className={`${tarjeta} divide-y divide-linea overflow-hidden`}>
            {(aCargo ?? []).map((h) => (
              <li key={h.id}>
                <Link href={`${base}/miembros/${h.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-limo">
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">{h.nombre}</span>
                    <span className="block text-sm text-tinta-suave">{h.nivel ?? "Sin nivel"}</span>
                  </span>
                  <Icono nombre="flecha" className="size-5 text-tinta-suave" />
                </Link>
              </li>
            ))}
          </ul>
        </Seccion>
      )}

      {esAdmin && (
        <Seccion titulo="Datos" id="s-datos">
          <form action={editarDatos} className={`${tarjeta} space-y-3 p-4`}>
            {ocultos}
            <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
              <div className="space-y-1.5">
                <label htmlFor="d-nombre" className={etiqueta}>
                  Nombre y apellido
                </label>
                <input id="d-nombre" name="nombre" required maxLength={120} defaultValue={m.nombre} className={campo} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="d-telefono" className={etiqueta}>
                  Teléfono
                </label>
                <input id="d-telefono" name="telefono" type="tel" maxLength={30} defaultValue={m.telefono ?? ""} className={campo} />
              </div>
            </div>
            <button type="submit" className={botonSecundario}>
              Guardar datos
            </button>
          </form>
        </Seccion>
      )}

      {esAdmin && m.rol !== "admin" && m.user_id !== ctx.userId && (
        <Seccion titulo="Dar de baja" id="s-baja">
          <details className={`${tarjeta} p-4`}>
            <summary className="flex min-h-11 cursor-pointer list-none items-center font-bold text-alerta">
              Dar de baja a {m.nombre}
            </summary>
            <form action={darDeBaja} className="mt-3 space-y-3">
              {ocultos}
              <p className="text-sm">
                Dejará de ver la hípica y se anularán sus reservas futuras
                {(aCargo ?? []).length > 0 ? " y las de los jinetes a su cargo" : ""}. No podrá volver a entrar con un enlace.
              </p>
              <button type="submit" className="inline-flex min-h-11 items-center rounded-xl bg-alerta px-4 font-bold text-white">
                Confirmar baja
              </button>
            </form>
          </details>
        </Seccion>
      )}
    </PantallaApp>
  );
}
