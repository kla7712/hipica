import { Suspense } from "react";
import {
  Aviso,
  Cabecera,
  CargandoApp,
  Chip,
  PantallaApp,
  Seccion,
  Vacio,
  boton,
  botonSecundario,
  campo,
  etiqueta,
  tarjeta,
} from "@/components/app/ui";
import { cargarContexto, navegacion, TIPOS_CLASE } from "@/lib/hipica";
import { cambiarEstadoClase, crearClase, generarCalendario } from "./actions";

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

type Clase = {
  id: string;
  titulo: string;
  nivel: string | null;
  tipo: string;
  dia_semana: number;
  hora_inicio: string;
  duracion_min: number;
  plazas: number;
  activa: boolean;
  monitor: { nombre: string } | null;
  pista: { nombre: string } | null;
};

type Persona = { id: string; nombre: string };
type Pista = { id: string; nombre: string };

export default function ClasesPage({ params, searchParams }: PageProps<"/hipica/[id]/clases">) {
  return (
    <Suspense fallback={<CargandoApp />}>
      <Contenido params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Contenido({ params, searchParams }: PageProps<"/hipica/[id]/clases">) {
  const { id } = await params;
  const query = await searchParams;
  const ctx = await cargarContexto(id);
  const { supabase, hipica } = ctx;
  const nav = navegacion(id, ctx.yo.rol, "horario");
  const volver = { href: `/hipica/${id}/horario`, texto: "Clases" };

  if (!ctx.esAdmin) {
    return (
      <PantallaApp nav={nav} cabecera={<Cabecera titulo="Horario semanal" volver={volver} />}>
        <Vacio>Solo el administrador puede gestionar las clases.</Vacio>
      </PantallaApp>
    );
  }

  const [{ data: clases, error }, { data: equipo }, { data: pistas }] = await Promise.all([
    supabase
      .from("clases")
      .select("id, titulo, nivel, tipo, dia_semana, hora_inicio, duracion_min, plazas, activa, monitor:miembros(nombre), pista:pistas(nombre)")
      .eq("hipica_id", id)
      .order("dia_semana")
      .order("hora_inicio")
      .returns<Clase[]>(),
    supabase
      .from("miembros")
      .select("id, nombre")
      .eq("hipica_id", id)
      .in("rol", ["admin", "monitor"])
      .eq("activo", true)
      .order("nombre")
      .returns<Persona[]>(),
    supabase.from("pistas").select("id, nombre").eq("hipica_id", id).eq("activa", true).order("orden").returns<Pista[]>(),
  ]);
  if (error) throw new Error(error.message);

  const aviso = textoAviso(query);
  const porDia = DIAS.map((nombre, i) => ({
    nombre,
    clases: (clases ?? []).filter((c) => c.dia_semana === i + 1),
  })).filter((d) => d.clases.length > 0);

  return (
    <PantallaApp
      nav={nav}
      cabecera={<Cabecera volver={volver} antetitulo={hipica.nombre} titulo="Horario semanal" detalle="Las clases que se repiten cada semana." />}
    >
      {aviso && (
        <div className="mb-5">
          <Aviso tipo={aviso.tipo === "error" ? "error" : "ok"}>{aviso.texto}</Aviso>
        </div>
      )}

      {porDia.length === 0 && <Vacio>Aún no hay clases. Crea la primera con el formulario de abajo.</Vacio>}
      {porDia.map((dia) => (
        <Seccion key={dia.nombre} titulo={dia.nombre}>
          <ul className={`${tarjeta} divide-y divide-linea overflow-hidden`}>
            {dia.clases.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-4">
                <p className={`w-14 shrink-0 font-extrabold tabular-nums ${c.activa ? "" : "text-tinta-suave/60"}`}>
                  {c.hora_inicio.slice(0, 5)}
                </p>
                <div className="min-w-0 flex-1">
                  <p className={`font-bold ${c.activa ? "" : "text-tinta-suave/60 line-through"}`}>{c.titulo}</p>
                  <p className="text-sm text-tinta-suave">
                    {[
                      c.tipo !== "grupo" && TIPOS_CLASE[c.tipo],
                      c.pista?.nombre,
                      `${c.duracion_min} min`,
                      `${c.plazas} ${c.plazas === 1 ? "plaza" : "plazas"}`,
                      c.monitor?.nombre,
                      c.nivel,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                {!c.activa && <Chip>Pausada</Chip>}
                <form action={cambiarEstadoClase}>
                  <input type="hidden" name="hipica_id" value={id} />
                  <input type="hidden" name="clase_id" value={c.id} />
                  <input type="hidden" name="activa" value={String(!c.activa)} />
                  <button type="submit" className={`${botonSecundario} px-3 text-sm`}>
                    {c.activa ? "Pausar" : "Reactivar"}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </Seccion>
      ))}

      {porDia.length > 0 && (
        <Seccion titulo="Publicar el calendario" id="publicar">
          <div className={`${tarjeta} space-y-3 p-4`}>
            <p className="text-sm text-tinta-suave">
              Crea las clases concretas de las próximas semanas para que se puedan reservar. Puedes repetirlo cuando
              quieras: no duplica las que ya existen. Si en Ajustes tienes el calendario automático, se hace solo cada noche.
            </p>
            <form action={generarCalendario} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="hipica_id" value={id} />
              <div className="space-y-1.5">
                <label htmlFor="semanas" className={etiqueta}>
                  Semanas
                </label>
                <select id="semanas" name="semanas" defaultValue="4" className={campo}>
                  <option value="2">Próximas 2</option>
                  <option value="4">Próximas 4</option>
                  <option value="8">Próximas 8</option>
                </select>
              </div>
              <button type="submit" className={boton}>
                Publicar calendario
              </button>
            </form>
          </div>
        </Seccion>
      )}

      <Seccion titulo="Nueva clase" id="nueva">
        <form action={crearClase} className={`${tarjeta} grid gap-4 p-4 sm:grid-cols-2`}>
          <input type="hidden" name="hipica_id" value={id} />
          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor="titulo" className={etiqueta}>
              Nombre
            </label>
            <input id="titulo" name="titulo" required maxLength={120} placeholder="Iniciación" className={campo} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="tipo" className={etiqueta}>
              Tipo
            </label>
            <select id="tipo" name="tipo" defaultValue="grupo" className={campo}>
              <option value="grupo">Clase de grupo (gasta bono)</option>
              <option value="particular">Clase particular</option>
              <option value="libre">Pista libre</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="pista_id" className={etiqueta}>
              Pista {pistas?.length ? "" : <span className="font-normal text-tinta-suave">(añádelas en Ajustes)</span>}
            </label>
            <select id="pista_id" name="pista_id" defaultValue="" className={campo}>
              <option value="">Sin pista</option>
              {(pistas ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="dia_semana" className={etiqueta}>
              Día
            </label>
            <select id="dia_semana" name="dia_semana" required defaultValue="1" className={campo}>
              {DIAS.map((d, i) => (
                <option key={d} value={i + 1}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="hora_inicio" className={etiqueta}>
              Hora de inicio
            </label>
            <input id="hora_inicio" name="hora_inicio" type="time" required defaultValue="18:00" className={campo} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="duracion_min" className={etiqueta}>
              Duración (min)
            </label>
            <input id="duracion_min" name="duracion_min" type="number" required min={15} max={480} step={15} defaultValue={60} className={campo} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="plazas" className={etiqueta}>
              Plazas
            </label>
            <input id="plazas" name="plazas" type="number" required min={1} max={100} defaultValue={6} className={campo} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="nivel" className={etiqueta}>
              Nivel <span className="font-normal text-tinta-suave">(opcional)</span>
            </label>
            <input id="nivel" name="nivel" maxLength={60} placeholder="Galope 1 a 3" className={campo} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="monitor_id" className={etiqueta}>
              Monitor <span className="font-normal text-tinta-suave">(opcional)</span>
            </label>
            <select id="monitor_id" name="monitor_id" defaultValue="" className={campo}>
              <option value="">Sin asignar</option>
              {(equipo ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className={`${boton} w-full`}>
              Añadir clase
            </button>
          </div>
        </form>
      </Seccion>
    </PantallaApp>
  );
}

function textoAviso(q: Record<string, string | string[] | undefined>) {
  if (q.ok === "creada") return { tipo: "ok", texto: "Clase añadida al horario." };
  if (typeof q.generadas === "string") {
    const n = Math.max(0, Math.floor(Number(q.generadas) || 0));
    return {
      tipo: "ok",
      texto:
        n === 0
          ? "El calendario ya estaba al día: no había clases nuevas que crear."
          : `Calendario publicado: ${n} clases creadas para las próximas ${[2, 4, 8].includes(Number(q.semanas)) ? Number(q.semanas) : ""} semanas.`,
    };
  }
  const errores: Record<string, string> = {
    datos: "Revisa los datos de la clase.",
    crear: "No se ha podido crear la clase. Vuelve a intentarlo.",
    generar: "No se ha podido publicar el calendario. Vuelve a intentarlo.",
  };
  if (typeof q.error === "string" && Object.hasOwn(errores, q.error)) {
    return { tipo: "error", texto: errores[q.error] };
  }
  return null;
}
