import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Aviso,
  Cabecera,
  CargandoApp,
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
import { SelectAuto } from "@/components/app/select-auto";
import { CUIDADOS, cargarContexto, fechas, navegacion, PUPILAJES, UBICACIONES } from "@/lib/hipica";
import { UUID } from "@/lib/rutas";
import { cambiarEstadoCaballo, crearCuidado, moverCaballo } from "../actions";
import { ListaCuidados, type Cuidado } from "../cuidados";
import { FormCaballo, type DatosCaballo } from "../form-caballo";
import { ListaSolicitudes, type Solicitud } from "../../servicios/solicitudes";

type Caballo = DatosCaballo & {
  disponible: boolean;
  ubicacion: string;
  ubicacion_desde: string;
  propietario: { nombre: string; telefono: string | null } | null;
};
type Hecho = { id: string; tipo: string; hecho_en: string | null; nota: string | null };

const MENSAJES: Record<string, { tipo: "ok" | "error"; texto: string }> = {
  creado: { tipo: "ok", texto: "Caballo dado de alta. Programa sus cuidados más abajo." },
  guardado: { tipo: "ok", texto: "Cambios guardados." },
  cuidado: { tipo: "ok", texto: "Cuidado programado." },
  "error-datos": { tipo: "error", texto: "Revisa los datos del caballo." },
  "error-guardar": { tipo: "error", texto: "No se han podido guardar los cambios." },
  "error-cuidado": { tipo: "error", texto: "No se ha podido guardar el cuidado. Revisa la fecha." },
};

export default function FichaCaballoPage({ params, searchParams }: PageProps<"/hipica/[id]/caballos/[caballoId]">) {
  return (
    <Suspense fallback={<CargandoApp />}>
      <Contenido params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Contenido({ params, searchParams }: PageProps<"/hipica/[id]/caballos/[caballoId]">) {
  const { id, caballoId } = await params;
  const { ok, error: codigoError } = await searchParams;
  if (!UUID.test(caballoId)) notFound();
  const ctx = await cargarContexto(id);
  const { supabase, hipica, esAdmin, esEquipo: esStaff } = ctx;
  const f = fechas(hipica.zona_horaria);
  const base = `/hipica/${id}`;
  const aqui = `${base}/caballos/${caballoId}`;

  const { data: c } = await supabase
    .from("caballos")
    .select(
      "id, nombre, tipo, propietario_id, box, pupilaje, raza, nacimiento, max_clases_dia, notas, dieta, disponible, ubicacion, ubicacion_desde, propietario:miembros(nombre, telefono)",
    )
    .eq("id", caballoId)
    .eq("hipica_id", id)
    .eq("activo", true)
    .maybeSingle<Caballo>();
  if (!c) notFound();

  const [{ data: pendientes }, { data: hechos }, { data: solicitudes }, { data: titulares }] = await Promise.all([
    supabase
      .from("cuidados")
      .select("id, caballo_id, tipo, fecha, nota, responsable")
      .eq("caballo_id", caballoId)
      .eq("hecho", false)
      .order("fecha")
      .returns<Cuidado[]>(),
    supabase
      .from("cuidados")
      .select("id, tipo, hecho_en, nota")
      .eq("caballo_id", caballoId)
      .eq("hecho", true)
      .order("hecho_en", { ascending: false })
      .limit(15)
      .returns<Hecho[]>(),
    supabase
      .from("solicitudes")
      .select("id, caballo_id, fecha, servicios, total, nota, estado, created_at")
      .eq("caballo_id", caballoId)
      .order("fecha", { ascending: false })
      .limit(10)
      .returns<Solicitud[]>(),
    esAdmin
      ? supabase
          .from("miembros")
          .select("id, nombre")
          .eq("hipica_id", id)
          .eq("activo", true)
          .eq("rol", "alumno")
          .is("titular_id", null)
          .order("nombre")
          .returns<{ id: string; nombre: string }[]>()
      : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
  ]);

  const ahora = new Date();
  const hoy = f.clave(ahora);
  const esMio = !esStaff;
  const edad = c.nacimiento ? new Date().getFullYear() - c.nacimiento : null;
  const codigo = typeof ok === "string" ? ok : typeof codigoError === "string" ? `error-${codigoError}` : null;
  const mensaje = codigo && Object.hasOwn(MENSAJES, codigo) ? MENSAJES[codigo] : null;
  const fCorta = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const desde = f.clave(c.ubicacion_desde) === hoy ? `desde las ${f.hora(c.ubicacion_desde)}` : `desde el ${f.medio(c.ubicacion_desde)}`;

  return (
    <PantallaApp
      nav={navegacion(ctx, esStaff ? "caballos" : "inicio")}
      cabecera={
        <Cabecera
          volver={esStaff ? { href: `${base}/caballos`, texto: "Caballos" } : { href: base, texto: "Inicio" }}
          titulo={c.nombre}
          detalle={[c.raza, edad !== null && `${edad} años`, c.box && `Box ${c.box}`].filter(Boolean).join(" · ") || undefined}
          demo={ctx.demo}
        >
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-white px-3 py-1 text-sm font-bold text-cuadra">
              {UBICACIONES[c.ubicacion] ?? c.ubicacion} {desde}
            </span>
            {c.pupilaje && <span className="rounded-full bg-white/15 px-3 py-1 text-sm font-bold">{PUPILAJES[c.pupilaje]}</span>}
            {c.tipo === "escuela" && <span className="rounded-full bg-white/15 px-3 py-1 text-sm font-bold">Caballo de escuela</span>}
            {!c.disponible && <span className="rounded-full bg-atencion-suave px-3 py-1 text-sm font-bold text-atencion">En reposo</span>}
          </div>
        </Cabecera>
      }
    >
      {mensaje && (
        <div className="mb-5">
          <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso>
        </div>
      )}

      {esStaff && (
        <Seccion titulo="Dónde está" id="donde">
          <form action={moverCaballo} className={`${tarjeta} space-y-2 p-4`}>
            <input type="hidden" name="hipica_id" value={id} />
            <input type="hidden" name="caballo_id" value={c.id} />
            <SelectAuto
              id="ubicacion"
              name="ubicacion"
              label={`Dónde está ${c.nombre}`}
              defaultValue={c.ubicacion}
              opciones={Object.entries(UBICACIONES).map(([valor, t]) => ({ valor, texto: t }))}
            />
            {c.tipo === "propietario" && <p className="text-sm text-tinta-suave">El propietario lo ve al momento.</p>}
          </form>
          {c.propietario && (
            <p className="mt-3 text-sm">
              Propietario: <span className="font-bold">{c.propietario.nombre}</span>
              {c.propietario.telefono && (
                <>
                  {" · "}
                  <a href={`tel:${c.propietario.telefono}`} className="underline">
                    {c.propietario.telefono}
                  </a>
                </>
              )}
            </p>
          )}
        </Seccion>
      )}

      <Seccion titulo="Próximos cuidados" id="cuidados">
        {(pendientes ?? []).length === 0 ? (
          <Vacio>{esStaff ? "No hay nada programado." : "No hay nada programado por ahora."}</Vacio>
        ) : (
          <ListaCuidados
            cuidados={pendientes ?? []}
            hoy={hoy}
            hipicaId={id}
            volver={aqui}
            modo={esStaff ? "equipo" : "propietario"}
            esPropietario={() => c.tipo === "propietario"}
          />
        )}
        {esMio && (pendientes ?? []).length > 0 && (
          <p className="mt-3 text-sm text-tinta-suave">
            Dinos si quieres que se encargue la hípica (se te cobrará según su tarifa) o si te encargas tú.
          </p>
        )}
        {esStaff && (
          <details className={`${tarjeta} mt-3 p-4`}>
            <summary className="flex min-h-11 cursor-pointer list-none items-center font-bold text-cuadra">+ Programar un cuidado</summary>
            <form action={crearCuidado} className="mt-3 space-y-3">
              <input type="hidden" name="hipica_id" value={id} />
              <input type="hidden" name="caballo_id" value={c.id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="c-tipo" className={etiqueta}>
                    Qué
                  </label>
                  <select id="c-tipo" name="tipo" className={campo}>
                    {Object.entries(CUIDADOS).map(([v, t]) => (
                      <option key={v} value={v}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="c-fecha" className={etiqueta}>
                    Cuándo
                  </label>
                  <input id="c-fecha" name="fecha" type="date" required defaultValue={hoy} className={campo} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="c-nota" className={etiqueta}>
                  Nota <span className="font-normal text-tinta-suave">(opcional)</span>
                </label>
                <input id="c-nota" name="nota" maxLength={300} placeholder="Ej.: gripe y tétanos" className={campo} />
              </div>
              <button type="submit" className={`${boton} w-full`}>
                Programar
              </button>
              <p className="text-sm text-tinta-suave">
                Al marcar el herrador, la vacuna, la desparasitación o el dentista como hechos, se programa solo el siguiente.
              </p>
            </form>
          </details>
        )}
      </Seccion>

      {(c.dieta || c.notas) && (
        <Seccion titulo="Dieta y notas" id="dieta">
          <div className={`${tarjeta} space-y-2 p-4`}>
            {c.dieta && <p className="whitespace-pre-line">{c.dieta}</p>}
            {c.notas && <p className="text-sm text-tinta-suave">{c.notas}</p>}
          </div>
        </Seccion>
      )}

      {(c.tipo === "propietario" || (solicitudes ?? []).length > 0) && (
        <Seccion
          titulo="Servicios pedidos"
          id="servicios"
          accion={
            esMio ? (
              <Link href={`${base}/servicios?caballo=${c.id}`} className="text-sm font-bold text-cuadra hover:underline">
                Pedir
              </Link>
            ) : undefined
          }
        >
          {(solicitudes ?? []).length === 0 ? (
            <Vacio>Aún no se ha pedido ningún servicio.</Vacio>
          ) : (
            <ListaSolicitudes solicitudes={solicitudes ?? []} hipicaId={id} volver={aqui} modo={esStaff ? "equipo" : "propietario"} puedeAceptar={ctx.esStaff} />
          )}
        </Seccion>
      )}

      <Seccion titulo="Historial" id="historial">
        {(hechos ?? []).length === 0 ? (
          <Vacio>Sin registros todavía.</Vacio>
        ) : (
          <ul className={`${tarjeta} divide-y divide-linea overflow-hidden`}>
            {(hechos ?? []).map((h) => (
              <li key={h.id} className="flex gap-3 px-4 py-3">
                <span className="w-24 shrink-0 text-sm font-semibold text-tinta-suave">
                  {h.hecho_en ? fCorta.format(new Date(h.hecho_en)) : "—"}
                </span>
                <span className="min-w-0">
                  <span className="block font-bold">{CUIDADOS[h.tipo] ?? h.tipo}</span>
                  {h.nota && <span className="block text-sm">{h.nota}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      {esAdmin && (
        <Seccion titulo="Datos del caballo" id="datos">
          <details className={`${tarjeta} p-4`}>
            <summary className="flex min-h-11 cursor-pointer list-none items-center font-bold text-cuadra">Editar datos</summary>
            <div className="-mx-4 -mb-4 mt-2">
              <FormCaballo hipicaId={id} titulares={titulares ?? []} caballo={c} />
            </div>
          </details>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <form action={cambiarEstadoCaballo}>
              <input type="hidden" name="hipica_id" value={id} />
              <input type="hidden" name="caballo_id" value={c.id} />
              <input type="hidden" name="campo" value="disponible" />
              <input type="hidden" name="valor" value={String(!c.disponible)} />
              <button type="submit" className={botonSecundario}>
                {c.disponible ? "Poner en reposo" : "Ya está disponible"}
              </button>
            </form>
            <details className="text-right">
              <summary className={`${botonTexto} cursor-pointer list-none hover:text-alerta`}>Dar de baja</summary>
              <form action={cambiarEstadoCaballo} className="mt-2 space-y-2 rounded-xl bg-alerta-suave p-3 text-left">
                <input type="hidden" name="hipica_id" value={id} />
                <input type="hidden" name="caballo_id" value={c.id} />
                <input type="hidden" name="campo" value="activo" />
                <input type="hidden" name="valor" value="false" />
                <p className="text-sm text-alerta">{c.nombre} dejará de aparecer en la app (por ejemplo, si se va de la hípica).</p>
                <button type="submit" className="inline-flex min-h-11 items-center rounded-xl bg-alerta px-4 font-bold text-white">
                  Confirmar baja
                </button>
              </form>
            </details>
          </div>
          <p className="mt-2 text-sm text-tinta-suave">En reposo no se puede asignar en clases. Máximo {c.max_clases_dia} clases al día.</p>
        </Seccion>
      )}

      {esMio && (
        <Link href={`${base}/servicios?caballo=${c.id}`} className={`${boton} mt-8 w-full`}>
          Pedir un servicio para {c.nombre}
        </Link>
      )}
    </PantallaApp>
  );
}
