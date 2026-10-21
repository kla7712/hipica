import { Suspense } from "react";
import Link from "next/link";
import {
  Aviso,
  Cabecera,
  CargandoApp,
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
import { cargarContexto, navegacion } from "@/lib/hipica";
import { cambiarPista, crearPista, guardarAjustes } from "./actions";

const MENSAJES: Record<string, { tipo: "ok" | "error"; texto: string }> = {
  guardado: { tipo: "ok", texto: "Ajustes guardados." },
  pista: { tipo: "ok", texto: "Pista añadida." },
  "error-datos": { tipo: "error", texto: "Revisa los datos." },
  "error-guardar": { tipo: "error", texto: "No se han podido guardar los ajustes. Vuelve a intentarlo." },
  "error-pista": { tipo: "error", texto: "No se ha podido añadir la pista. Revisa el nombre." },
};

type Ajustes = { nombre: string; horas_minimas_anulacion: number; calendario_auto: boolean; semanas_auto: number; exigir_bono: boolean };
type Pista = { id: string; nombre: string; activa: boolean };

export default function AjustesPage({ params, searchParams }: PageProps<"/hipica/[id]/ajustes">) {
  return (
    <Suspense fallback={<CargandoApp />}>
      <Contenido params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Contenido({ params, searchParams }: PageProps<"/hipica/[id]/ajustes">) {
  const { id } = await params;
  const { ok, error } = await searchParams;
  const ctx = await cargarContexto(id);
  const { supabase, hipica } = ctx;
  const nav = navegacion(id, ctx.yo.rol, "ajustes");

  if (!ctx.esAdmin) {
    return (
      <PantallaApp nav={nav} cabecera={<Cabecera antetitulo={hipica.nombre} titulo="Ajustes" />}>
        <Vacio>Solo el administrador puede cambiar los ajustes.</Vacio>
      </PantallaApp>
    );
  }

  const [{ data: h }, { data: pistas }] = await Promise.all([
    supabase
      .from("hipicas")
      .select("nombre, horas_minimas_anulacion, calendario_auto, semanas_auto, exigir_bono")
      .eq("id", id)
      .single<Ajustes>(),
    supabase.from("pistas").select("id, nombre, activa").eq("hipica_id", id).order("orden").returns<Pista[]>(),
  ]);
  if (!h) throw new Error("No se han podido cargar los ajustes");

  const codigo = typeof ok === "string" ? ok : typeof error === "string" ? `error-${error}` : null;
  const mensaje = codigo && Object.hasOwn(MENSAJES, codigo) ? MENSAJES[codigo] : null;

  return (
    <PantallaApp nav={nav} cabecera={<Cabecera antetitulo={hipica.nombre} titulo="Ajustes" demo={ctx.demo} />}>
      {mensaje && (
        <div className="mb-5">
          <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso>
        </div>
      )}

      <Seccion titulo="Clases" id="clases">
        <Link href={`/hipica/${id}/clases`} className={`${tarjeta} flex items-center gap-3 px-4 py-4 hover:bg-white/70`}>
          <span className="min-w-0 flex-1">
            <span className="block font-bold">Horario semanal</span>
            <span className="block text-sm text-tinta-suave">Crear clases, pausarlas y publicar el calendario</span>
          </span>
          <Icono nombre="flecha" className="size-5 text-tinta-suave" />
        </Link>
      </Seccion>

      <Seccion titulo="Normas de la hípica" id="normas">
        <form action={guardarAjustes} className={`${tarjeta} space-y-6 p-4`}>
          <input type="hidden" name="hipica_id" value={id} />

          <div className="space-y-1.5">
            <label htmlFor="nombre" className={etiqueta}>
              Nombre de la hípica
            </label>
            <input id="nombre" name="nombre" required minLength={2} maxLength={120} defaultValue={h.nombre} className={campo} />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="horas" className={etiqueta}>
              Plazo para anular una reserva
            </label>
            <select id="horas" name="horas" defaultValue={String(h.horas_minimas_anulacion)} className={campo}>
              <option value="0">Hasta que empiece la clase</option>
              <option value="2">Hasta 2 horas antes</option>
              <option value="6">Hasta 6 horas antes</option>
              <option value="12">Hasta 12 horas antes</option>
              <option value="24">Hasta 24 horas antes</option>
              <option value="48">Hasta 48 horas antes</option>
            </select>
            <p className="text-sm text-tinta-suave">Pasado el plazo, solo tú puedes anular la reserva de un alumno.</p>
          </div>

          <label className="flex items-start gap-3">
            <input type="checkbox" name="exigir_bono" value="si" defaultChecked={h.exigir_bono} className="mt-1 size-5 accent-cuadra" />
            <span>
              <span className="font-bold">Pedir bono para reservar clases de grupo</span>
              <span className="block text-sm text-tinta-suave">
                Si no le quedan clases en el bono, no podrá reservar desde la app. Tú sí podrás apuntarle. La pista libre y
                las particulares no gastan bono.
              </span>
            </span>
          </label>

          <fieldset className="space-y-3">
            <legend className="sr-only">Calendario</legend>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                name="calendario_auto"
                value="si"
                defaultChecked={h.calendario_auto}
                className="mt-1 size-5 accent-cuadra"
              />
              <span>
                <span className="font-bold">Publicar el calendario automáticamente</span>
                <span className="block text-sm text-tinta-suave">
                  Cada noche se publican las clases que falten, para que siempre haya semanas por delante.
                </span>
              </span>
            </label>
            <div className="space-y-1.5 pl-8">
              <label htmlFor="semanas" className={etiqueta}>
                Semanas por delante
              </label>
              <select id="semanas" name="semanas" defaultValue={String(h.semanas_auto)} className={campo}>
                {[1, 2, 3, 4, 6, 8].map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? "semana" : "semanas"}
                  </option>
                ))}
              </select>
            </div>
          </fieldset>

          <button type="submit" className={`${boton} w-full`}>
            Guardar ajustes
          </button>
        </form>
      </Seccion>

      <Seccion titulo="Pistas" id="pistas">
        <div className="space-y-3">
          {(pistas ?? []).length > 0 && (
            <ul className={`${tarjeta} divide-y divide-linea overflow-hidden`}>
              {(pistas ?? []).map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <span className={`min-w-0 flex-1 font-bold ${p.activa ? "" : "text-tinta-suave line-through"}`}>{p.nombre}</span>
                  {!p.activa && <Chip>Sin usar</Chip>}
                  <form action={cambiarPista}>
                    <input type="hidden" name="hipica_id" value={id} />
                    <input type="hidden" name="pista_id" value={p.id} />
                    <input type="hidden" name="activa" value={String(!p.activa)} />
                    <button type="submit" className={botonTexto}>
                      {p.activa ? "Dejar de usar" : "Volver a usar"}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <form action={crearPista} className={`${tarjeta} flex flex-wrap items-end gap-3 p-4`}>
            <input type="hidden" name="hipica_id" value={id} />
            <div className="min-w-0 flex-1 basis-48 space-y-1.5">
              <label htmlFor="pista-nombre" className={etiqueta}>
                Nueva pista
              </label>
              <input id="pista-nombre" name="nombre" required maxLength={60} placeholder="Ej.: Cubierta" className={campo} />
            </div>
            <button type="submit" className={botonSecundario}>
              Añadir
            </button>
          </form>
          <p className="text-sm text-tinta-suave">Así cada clase dice dónde es y en Hoy puedes ver cada pista por separado.</p>
        </div>
      </Seccion>
    </PantallaApp>
  );
}
