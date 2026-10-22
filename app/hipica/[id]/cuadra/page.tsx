import { Suspense } from "react";
import Link from "next/link";
import {
  Resumen,
  Aviso,
  Cabecera,
  CargandoApp,
  Chip,
  Icono,
  PantallaApp,
  Progreso,
  Seccion,
  Segmento,
  Vacio,
  boton,
  botonSecundario,
  botonTexto,
  campo,
  etiqueta,
  tarjeta,
} from "@/components/app/ui";
import { capitalizar, cargarContexto, fechas, navegacion, nombrePila, type Contexto } from "@/lib/hipica";
import { ListaCuidados, type Cuidado } from "../caballos/cuidados";
import { ListaSolicitudes, type Solicitud } from "../servicios/solicitudes";
import {
  ajustarExistencia,
  borrarExistencia,
  borrarTarea,
  crearExistencia,
  crearTarea,
  marcarPedido,
  marcarTarea,
} from "./actions";

type Tarea = {
  id: string;
  titulo: string;
  detalle: string | null;
  turno: "manana" | "tarde";
  hora: string | null;
  dias: number[];
  fecha: string | null;
  responsable: { nombre: string } | null;
};
type Hecha = { tarea_id: string; hecha_en: string; quien: { nombre: string } | null };
type Existencia = {
  id: string;
  nombre: string;
  unidad: string;
  cantidad: number;
  minimo: number;
  consumo_dia: number | null;
  proveedor: string | null;
  proveedor_tel: string | null;
  pedido_en: string | null;
};

const LETRAS = ["L", "M", "X", "J", "V", "S", "D"];
const MENSAJES: Record<string, { tipo: "ok" | "error"; texto: string }> = {
  tarea: { tipo: "ok", texto: "Tarea añadida." },
  almacen: { tipo: "ok", texto: "Producto añadido al almacén." },
  "error-tarea": { tipo: "error", texto: "No se ha podido añadir la tarea. Revisa los datos." },
  "error-almacen": { tipo: "error", texto: "No se ha podido añadir el producto. Revisa los números." },
};

export default function CuadraPage({ params, searchParams }: PageProps<"/hipica/[id]/cuadra">) {
  return (
    <Suspense fallback={<CargandoApp />}>
      <Contenido params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Contenido({ params, searchParams }: PageProps<"/hipica/[id]/cuadra">) {
  const { id } = await params;
  const q = await searchParams;
  const ctx = await cargarContexto(id);
  const codigo = typeof q.ok === "string" ? q.ok : typeof q.error === "string" ? `error-${q.error}` : null;
  const mensaje = codigo && Object.hasOwn(MENSAJES, codigo) ? MENSAJES[codigo] : null;
  if (!ctx.esEquipo) {
    return (
      <PantallaApp nav={navegacion(ctx, null)} cabecera={<Cabecera antetitulo={ctx.hipica.nombre} titulo="Cuadra" />}>
        <Vacio>Esta sección es para el equipo de la hípica.</Vacio>
      </PantallaApp>
    );
  }
  return <Cuadra ctx={ctx} turnoQ={q.turno} mensaje={mensaje} />;
}

async function Cuadra({
  ctx,
  turnoQ,
  mensaje,
}: {
  ctx: Contexto;
  turnoQ?: string | string[];
  mensaje: { tipo: "ok" | "error"; texto: string } | null;
}) {
  const { supabase, hipica, esAdmin, esStaff } = ctx;
  const f = fechas(hipica.zona_horaria);
  const ahora = new Date();
  const hoy = f.clave(ahora);
  const base = `/hipica/${hipica.id}`;
  const hora = Number(new Intl.DateTimeFormat("es-ES", { timeZone: hipica.zona_horaria, hour: "numeric", hourCycle: "h23" }).format(ahora));
  const turno = turnoQ === "manana" || turnoQ === "tarde" ? turnoQ : hora < 15 ? "manana" : "tarde";
  const diaSemana = ((new Date(`${hoy}T12:00:00Z`).getUTCDay() + 6) % 7) + 1; // 1 = lunes

  const [{ data: tareas }, { data: hechas }, { data: existencias }, { data: cuidados }, { data: solicitudes }, { data: equipo }, { data: caballos }] =
    await Promise.all([
      supabase
        .from("tareas")
        .select("id, titulo, detalle, turno, hora, dias, fecha, responsable:miembros(nombre)")
        .eq("hipica_id", hipica.id)
        .eq("activa", true)
        .order("hora", { nullsFirst: false })
        .returns<Tarea[]>(),
      supabase
        .from("tareas_hechas")
        .select("tarea_id, hecha_en, quien:miembros(nombre)")
        .eq("hipica_id", hipica.id)
        .eq("fecha", hoy)
        .returns<Hecha[]>(),
      supabase
        .from("existencias")
        .select("id, nombre, unidad, cantidad, minimo, consumo_dia, proveedor, proveedor_tel, pedido_en")
        .eq("hipica_id", hipica.id)
        .order("orden")
        .order("nombre")
        .returns<Existencia[]>(),
      supabase
        .from("cuidados")
        .select("id, caballo_id, tipo, fecha, nota, responsable")
        .eq("hipica_id", hipica.id)
        .eq("hecho", false)
        .lte("fecha", hoy)
        .order("fecha")
        .returns<Cuidado[]>(),
      supabase
        .from("solicitudes")
        .select("id, caballo_id, fecha, servicios, total, nota, estado, created_at")
        .eq("hipica_id", hipica.id)
        .eq("estado", "aceptada")
        .lte("fecha", hoy)
        .order("fecha")
        .returns<Solicitud[]>(),
      supabase
        .from("miembros")
        .select("id, nombre")
        .eq("hipica_id", hipica.id)
        .eq("activo", true)
        .neq("rol", "alumno")
        .order("nombre")
        .returns<{ id: string; nombre: string }[]>(),
      supabase.from("caballos").select("id, nombre, tipo").eq("hipica_id", hipica.id).returns<{ id: string; nombre: string; tipo: string }[]>(),
    ]);

  const deHoy = (tareas ?? []).filter((t) => (t.fecha ? t.fecha === hoy : t.dias.includes(diaSemana)));
  const delTurno = deHoy.filter((t) => t.turno === turno);
  const hechaDe = new Map((hechas ?? []).map((h) => [h.tarea_id, h]));
  const nHechas = delTurno.filter((t) => hechaDe.has(t.id)).length;
  const fijas = (tareas ?? []).filter((t) => !t.fecha);
  const nombreCaballo = new Map((caballos ?? []).map((c) => [c.id, c.nombre]));
  const tipoCaballo = new Map((caballos ?? []).map((c) => [c.id, c.tipo]));
  const url = (t: string) => `${base}/cuadra?turno=${t}`;

  return (
    <PantallaApp
      nav={navegacion(ctx, "cuadra")}
      cabecera={
        <Cabecera antetitulo={capitalizar(f.largo(ahora))} titulo="Cuadra" demo={ctx.demo}>
          <Segmento
            label="Turno"
            opciones={[
              { texto: "Mañana", href: url("manana"), activo: turno === "manana" },
              { texto: "Tarde", href: url("tarde"), activo: turno === "tarde" },
            ]}
          />
          <Progreso hechas={nHechas} total={delTurno.length} texto="Tareas del turno" />
        </Cabecera>
      }
    >
      {mensaje && (
        <div className="mb-5">
          <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso>
        </div>
      )}

      <Seccion titulo="Tareas" id="tareas">
        {delTurno.length === 0 ? (
          <Vacio>No hay tareas para este turno. Añade la primera más abajo.</Vacio>
        ) : (
          <ul className={`${tarjeta} divide-y divide-linea overflow-hidden`}>
            {delTurno.map((t) => {
              const h = hechaDe.get(t.id);
              return (
                <li key={t.id}>
                  <form action={marcarTarea}>
                    <input type="hidden" name="hipica_id" value={hipica.id} />
                    <input type="hidden" name="tarea_id" value={t.id} />
                    <input type="hidden" name="fecha" value={hoy} />
                    <input type="hidden" name="hecha" value={String(!h)} />
                    <button
                      type="submit"
                      aria-pressed={!!h}
                      className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-limo"
                    >
                      <span
                        aria-hidden="true"
                        className={`flex size-7 shrink-0 items-center justify-center rounded-lg border-2 ${
                          h ? "border-cuadra bg-cuadra text-white" : "border-linea bg-white"
                        }`}
                      >
                        {h && <Icono nombre="check" className="size-4" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block font-bold ${h ? "text-tinta-suave line-through" : ""}`}>{t.titulo}</span>
                        <span className="block text-sm text-tinta-suave">
                          {h
                            ? `Hecha${h.quien ? ` por ${nombrePila(h.quien.nombre)}` : ""} a las ${f.hora(h.hecha_en)}`
                            : [t.detalle, t.responsable && nombrePila(t.responsable.nombre)].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      {t.hora && <span className="cifra shrink-0 text-xl leading-none">{t.hora.slice(0, 5)}</span>}
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}

        <details className={`${tarjeta} mt-3 p-4 group`}>
          <Resumen>Añadir una tarea</Resumen>
          <form action={crearTarea} className="mt-3 space-y-3">
            <input type="hidden" name="hipica_id" value={hipica.id} />
            <input type="hidden" name="hoy" value={hoy} />
            <div className="space-y-1.5">
              <label htmlFor="t-titulo" className={etiqueta}>
                Qué hay que hacer
              </label>
              <input id="t-titulo" name="titulo" required maxLength={80} placeholder="Ej.: Medicación de Brisa" className={campo} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="t-detalle" className={etiqueta}>
                Detalle <span className="font-normal text-tinta-suave">(opcional)</span>
              </label>
              <input id="t-detalle" name="detalle" maxLength={160} placeholder="Ej.: antiinflamatorio, día 3 de 5" className={campo} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="t-turno" className={etiqueta}>
                  Turno
                </label>
                <select id="t-turno" name="turno" defaultValue={turno} className={campo}>
                  <option value="manana">Mañana</option>
                  <option value="tarde">Tarde</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="t-hora" className={etiqueta}>
                  Hora <span className="font-normal text-tinta-suave">(opcional)</span>
                </label>
                <input id="t-hora" name="hora" type="time" className={campo} />
              </div>
            </div>
            <fieldset className="min-w-0 space-y-2">
              <legend className={`${etiqueta} mb-1.5`}>¿Cuándo?</legend>
              <label className="flex min-h-10 items-center gap-2">
                <input type="radio" name="cuando" value="hoy" defaultChecked className="size-5 accent-cuadra" /> Solo hoy
              </label>
              <label className="flex min-h-10 items-center gap-2">
                <input type="radio" name="cuando" value="siempre" className="size-5 accent-cuadra" /> Todos los días
              </label>
              <label className="flex min-h-10 items-center gap-2">
                <input type="radio" name="cuando" value="dias" className="size-5 accent-cuadra" /> Solo estos días:
              </label>
              <div className="flex flex-wrap gap-1.5 pl-7">
                {LETRAS.map((l, i) => (
                  <label key={l} className="flex size-10 cursor-pointer items-center justify-center rounded-lg border border-linea bg-white text-sm font-bold has-checked:border-cuadra has-checked:bg-cuadra has-checked:text-white">
                    <input type="checkbox" name="dias" value={i + 1} className="sr-only" />
                    {l}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="space-y-1.5">
              <label htmlFor="t-resp" className={etiqueta}>
                Quién <span className="font-normal text-tinta-suave">(opcional)</span>
              </label>
              <select id="t-resp" name="responsable_id" defaultValue="" className={campo}>
                <option value="">Cualquiera</option>
                {(equipo ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className={`${boton} w-full`}>
              Añadir tarea
            </button>
          </form>
        </details>

        {fijas.length > 0 && (
          <details className="mt-3">
            <summary className={`${botonTexto} cursor-pointer list-none`}>Ver las tareas fijas ({fijas.length})</summary>
            <ul className={`${tarjeta} mt-2 divide-y divide-linea overflow-hidden`}>
              {fijas.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">{t.titulo}</span>
                    <span className="block text-sm text-tinta-suave">
                      {t.turno === "manana" ? "Mañana" : "Tarde"}
                      {t.hora && ` · ${t.hora.slice(0, 5)}`} ·{" "}
                      {t.dias.length === 7 ? "todos los días" : t.dias.map((d) => LETRAS[d - 1]).join(" ")}
                    </span>
                  </span>
                  <form action={borrarTarea}>
                    <input type="hidden" name="hipica_id" value={hipica.id} />
                    <input type="hidden" name="tarea_id" value={t.id} />
                    <button type="submit" className={`${botonTexto} hover:text-alerta`} aria-label={`Borrar ${t.titulo}`}>
                      Borrar
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </details>
        )}
      </Seccion>

      {((cuidados ?? []).length > 0 || (solicitudes ?? []).length > 0) && (
        <Seccion titulo="También hoy" id="tambien">
          <div className="space-y-3">
            {(cuidados ?? []).length > 0 && (
              <ListaCuidados
                cuidados={cuidados ?? []}
                hoy={hoy}
                hipicaId={hipica.id}
                volver={`${base}/cuadra`}
                modo="equipo"
                nombreCaballo={(id) => nombreCaballo.get(id) ?? null}
                esPropietario={(id) => tipoCaballo.get(id) === "propietario"}
              />
            )}
            {(solicitudes ?? []).length > 0 && (
              <ListaSolicitudes
                solicitudes={solicitudes ?? []}
                hipicaId={hipica.id}
                volver={`${base}/cuadra`}
                modo="equipo"
                puedeAceptar={esStaff}
                nombreCaballo={(id) => nombreCaballo.get(id) ?? null}
              />
            )}
          </div>
        </Seccion>
      )}

      <Seccion titulo="Almacén" id="almacen">
        {(existencias ?? []).length === 0 ? (
          <Vacio>{esAdmin ? "Añade lo que quieres controlar: pienso, heno, paja, viruta…" : "El administrador aún no ha preparado el almacén."}</Vacio>
        ) : (
          <ul className={`${tarjeta} divide-y divide-linea overflow-hidden`}>
            {(existencias ?? []).map((e) => (
              <FilaAlmacen key={e.id} e={e} hipicaId={hipica.id} esAdmin={esAdmin} nombreHipica={hipica.nombre} fecha={f.medio} />
            ))}
          </ul>
        )}
        {esAdmin && (
          <details className={`${tarjeta} mt-3 p-4 group`}>
            <Resumen>Añadir un producto</Resumen>
            <form action={crearExistencia} className="mt-3 space-y-3">
              <input type="hidden" name="hipica_id" value={hipica.id} />
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="e-nombre" className={etiqueta}>
                    Producto
                  </label>
                  <input id="e-nombre" name="nombre" required maxLength={40} placeholder="Pienso" className={campo} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="e-unidad" className={etiqueta}>
                    Se cuenta en
                  </label>
                  <input id="e-unidad" name="unidad" maxLength={20} placeholder="sacos" className={campo} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="e-cantidad" className={etiqueta}>
                    Hay ahora
                  </label>
                  <input id="e-cantidad" name="cantidad" inputMode="decimal" placeholder="20" className={campo} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="e-minimo" className={etiqueta}>
                    Avisar con menos de
                  </label>
                  <input id="e-minimo" name="minimo" inputMode="decimal" placeholder="10" className={campo} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="e-consumo" className={etiqueta}>
                    Se gastan al día <span className="font-normal text-tinta-suave">(opc.)</span>
                  </label>
                  <input id="e-consumo" name="consumo_dia" inputMode="decimal" placeholder="2" className={campo} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="e-tel" className={etiqueta}>
                    Tel. del proveedor <span className="font-normal text-tinta-suave">(opc.)</span>
                  </label>
                  <input id="e-tel" name="proveedor_tel" type="tel" maxLength={30} className={campo} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="e-prov" className={etiqueta}>
                  Proveedor <span className="font-normal text-tinta-suave">(opcional)</span>
                </label>
                <input id="e-prov" name="proveedor" maxLength={60} className={campo} />
              </div>
              <button type="submit" className={`${boton} w-full`}>
                Añadir al almacén
              </button>
            </form>
          </details>
        )}
      </Seccion>

      <p className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <Link href={`${base}/caballos`} className="font-bold text-cuadra underline">
          Dónde está cada caballo
        </Link>
        <Link href={`${base}/equipo#profesionales`} className="font-bold text-cuadra underline">
          Teléfonos del veterinario, herrador…
        </Link>
      </p>
    </PantallaApp>
  );
}

// "600 200 001" → "34600200001" para WhatsApp.
const telWhatsApp = (t: string) => {
  const d = t.replace(/\D/g, "");
  return d.length === 9 ? `34${d}` : d;
};

function FilaAlmacen({
  e,
  hipicaId,
  esAdmin,
  nombreHipica,
  fecha,
}: {
  e: Existencia;
  hipicaId: string;
  esAdmin: boolean;
  nombreHipica: string;
  fecha: (d: string) => string;
}) {
  const cantidad = Number(e.cantidad);
  const minimo = Number(e.minimo);
  const bajo = cantidad < minimo;
  const tope = Math.max(minimo * 2.5, cantidad, 1);
  const pct = Math.min(100, Math.round((cantidad / tope) * 100));
  const dias = e.consumo_dia ? Math.floor(cantidad / Number(e.consumo_dia)) : null;
  const pedir = Math.max(Math.ceil(minimo * 2.5 - cantidad), 1);
  const mensaje = `Hola${e.proveedor ? ` ${e.proveedor}` : ""}, soy de ${nombreHipica}. Necesitamos ${pedir} ${e.unidad} de ${e.nombre.toLowerCase()}. ¿Cuándo podríais traerlo? Gracias.`;
  const oculto = (
    <>
      <input type="hidden" name="hipica_id" value={hipicaId} />
      <input type="hidden" name="existencia_id" value={e.id} />
    </>
  );
  const fmt = (n: number) => n.toLocaleString("es-ES", { maximumFractionDigits: 1 });

  return (
    <li className="space-y-2.5 px-4 py-3.5">
      <div className="flex items-center gap-3">
        <span className="w-20 shrink-0 font-bold">{e.nombre}</span>
        <div aria-hidden="true" className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-barra-vacia">
          <div className={`h-full rounded-full ${bajo ? "bg-punto-atencion" : "bg-barra"}`} style={{ width: `${pct}%` }} />
        </div>
        <span className={`w-20 shrink-0 text-right text-sm font-bold tabular-nums ${bajo ? "text-atencion" : "text-tinta-suave"}`}>
          {fmt(cantidad)} {e.unidad}
        </span>
        <div className="flex shrink-0 gap-1">
          <form action={ajustarExistencia}>
            {oculto}
            <input type="hidden" name="cambio" value="-1" />
            <button type="submit" aria-label={`Restar 1 ${e.unidad} de ${e.nombre}`} className="flex size-10 items-center justify-center rounded-xl border border-linea bg-white text-lg font-bold">
              −
            </button>
          </form>
          <form action={ajustarExistencia}>
            {oculto}
            <input type="hidden" name="cambio" value="1" />
            <button type="submit" aria-label={`Sumar 1 ${e.unidad} de ${e.nombre}`} className="flex size-10 items-center justify-center rounded-xl border border-linea bg-white text-lg font-bold">
              +
            </button>
          </form>
        </div>
      </div>

      {bajo && !e.pedido_en && (
        <div className="space-y-2 rounded-xl bg-atencion-suave p-3">
          <p className="text-sm font-semibold text-atencion">
            Bajo mínimos{dias !== null ? ` · quedan unos ${dias} ${dias === 1 ? "día" : "días"}` : ""}.
          </p>
          <div className="flex flex-wrap gap-2">
            {e.proveedor_tel && (
              <a
                href={`https://wa.me/${telWhatsApp(e.proveedor_tel)}?text=${encodeURIComponent(mensaje)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`${boton} flex-1 px-3 text-sm`}
              >
                Pedir por WhatsApp
              </a>
            )}
            <form action={marcarPedido} className="flex-1">
              {oculto}
              <input type="hidden" name="pedido" value="true" />
              <button type="submit" className={`${botonSecundario} w-full px-3 text-sm`}>
                Ya lo he pedido
              </button>
            </form>
          </div>
        </div>
      )}
      {e.pedido_en && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Chip tono="ok">Pedido el {fecha(e.pedido_en)}</Chip>
          <form action={marcarPedido}>
            {oculto}
            <input type="hidden" name="pedido" value="false" />
            <button type="submit" className={botonTexto}>
              Deshacer
            </button>
          </form>
        </div>
      )}

      <details>
        <summary className={`${botonTexto} cursor-pointer list-none`}>Ha llegado un pedido / otra cantidad</summary>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <form action={ajustarExistencia} className="flex flex-1 items-end gap-2">
            {oculto}
            <div className="min-w-0 flex-1 space-y-1.5">
              <label htmlFor={`cambio-${e.id}`} className={etiqueta}>
                Sumar (o restar con −)
              </label>
              <input id={`cambio-${e.id}`} name="cambio" inputMode="decimal" required placeholder="20" className={campo} />
            </div>
            <button type="submit" className={botonSecundario}>
              Guardar
            </button>
          </form>
          {esAdmin && (
            <form action={borrarExistencia}>
              {oculto}
              <button type="submit" className={`${botonTexto} hover:text-alerta`}>
                Quitar del almacén
              </button>
            </form>
          )}
        </div>
      </details>
    </li>
  );
}
