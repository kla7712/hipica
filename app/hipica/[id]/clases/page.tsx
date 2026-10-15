import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient, getUserId } from "@/lib/supabase/server";
import { Pantalla, Volver } from "@/components/app/ui";
import { cambiarEstadoClase, crearClase, generarCalendario } from "./actions";

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

type Clase = {
  id: string;
  titulo: string;
  nivel: string | null;
  dia_semana: number;
  hora_inicio: string;
  duracion_min: number;
  plazas: number;
  activa: boolean;
  monitor: { nombre: string } | null;
};

type Persona = { id: string; nombre: string; rol: string };

const input =
  "w-full rounded-lg border border-linea bg-white px-3 py-2.5 text-base text-tinta outline-none focus:border-cuadra";
const boton =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-cuadra px-4 font-semibold text-white hover:bg-cuadra-hover";

export default function ClasesPage({ params, searchParams }: PageProps<"/hipica/[id]/clases">) {
  return (
    <Pantalla>
      <Volver href="/">Tus hípicas</Volver>
      <Suspense fallback={<p className="mt-6 text-sm text-tinta-suave">Cargando…</p>}>
        <Contenido params={params} searchParams={searchParams} />
      </Suspense>
    </Pantalla>
  );
}

async function Contenido({ params, searchParams }: PageProps<"/hipica/[id]/clases">) {
  const { id } = await params;
  const query = await searchParams;

  const userId = await getUserId();
  if (!userId) redirect("/login");

  const supabase = await createClient();

  // Solo el administrador gestiona las clases (RLS también lo impide).
  const { data: yo } = await supabase
    .from("miembros")
    .select("rol, hipicas(nombre)")
    .eq("hipica_id", id)
    .eq("user_id", userId)
    .maybeSingle<{ rol: string; hipicas: { nombre: string } | null }>();
  if (!yo) notFound();
  if (yo.rol !== "admin") {
    return <p className="mt-8 text-tinta-suave">Solo el administrador puede gestionar las clases.</p>;
  }

  const [{ data: clases, error }, { data: equipo }] = await Promise.all([
    supabase
      .from("clases")
      .select("id, titulo, nivel, dia_semana, hora_inicio, duracion_min, plazas, activa, monitor:miembros(nombre)")
      .eq("hipica_id", id)
      .order("dia_semana")
      .order("hora_inicio")
      .returns<Clase[]>(),
    supabase
      .from("miembros")
      .select("id, nombre, rol")
      .eq("hipica_id", id)
      .in("rol", ["admin", "monitor"])
      .eq("activo", true)
      .order("nombre")
      .returns<Persona[]>(),
  ]);
  if (error) throw new Error(error.message);

  const aviso = textoAviso(query);
  const porDia = DIAS.map((nombre, i) => ({
    nombre,
    clases: (clases ?? []).filter((c) => c.dia_semana === i + 1),
  })).filter((d) => d.clases.length > 0);

  return (
    <div className="mt-4 space-y-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight [font-stretch:85%] sm:text-4xl">Clases</h1>
        <p className="text-sm text-tinta-suave">{yo.hipicas?.nombre} · horario semanal</p>
      </div>

      {aviso && (
        <p
          role="status"
          className={`rounded-lg border p-3 text-sm ${
            aviso.tipo === "error"
              ? "border-alerta/30 bg-alerta-suave text-alerta"
              : "border-cuadra/25 bg-alfalfa-suave text-tinta"
          }`}
        >
          {aviso.texto}
        </p>
      )}

      {/* Horario semanal */}
      <section className="space-y-6">
        {porDia.length === 0 && (
          <p className="rounded-xl border border-dashed border-linea bg-white/60 px-6 py-10 text-center text-tinta-suave">
            Aún no hay clases. Crea la primera con el formulario de abajo.
          </p>
        )}
        {porDia.map((dia) => (
          <div key={dia.nombre} className="space-y-2">
            <h2 className="text-lg font-bold [font-stretch:85%]">
              {dia.nombre}
            </h2>
            <ul className="divide-y divide-linea overflow-hidden rounded-xl border border-linea bg-white">
              {dia.clases.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
                  <div className="w-16 shrink-0 text-[1.75rem] font-bold leading-none tabular-nums tracking-tight [font-stretch:68%]">{c.hora_inicio.slice(0, 5)}</div>
                  <div className="min-w-0 flex-1">
                    <p className={`font-semibold ${c.activa ? "" : "text-tinta-suave/60 line-through"}`}>
                      {c.titulo}
                      {c.nivel && <span className="font-normal text-tinta-suave"> · {c.nivel}</span>}
                    </p>
                    <p className="text-sm text-tinta-suave">
                      {c.duracion_min} min · {c.plazas} plazas
                      {c.monitor && ` · ${c.monitor.nombre}`}
                      {!c.activa && " · pausada"}
                    </p>
                  </div>
                  <form action={cambiarEstadoClase}>
                    <input type="hidden" name="hipica_id" value={id} />
                    <input type="hidden" name="clase_id" value={c.id} />
                    <input type="hidden" name="activa" value={String(!c.activa)} />
                    <button
                      type="submit"
                      className="inline-flex min-h-11 items-center justify-center rounded-lg border border-linea bg-white px-3 text-sm font-semibold hover:border-tinta-suave"
                    >
                      {c.activa ? "Pausar" : "Reactivar"}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {/* Generar calendario */}
      {porDia.length > 0 && (
        <section className="space-y-3 rounded-xl border border-linea bg-white p-5">
          <div>
            <h2 className="font-semibold">Publicar el calendario</h2>
            <p className="text-sm text-tinta-suave">
              Crea las clases concretas de las próximas semanas para que los alumnos puedan
              reservar. Puedes repetirlo cuando quieras: no duplica las que ya existen.
            </p>
          </div>
          <form action={generarCalendario} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="hipica_id" value={id} />
            <div className="space-y-1">
              <label htmlFor="semanas" className="text-sm font-semibold">
                Semanas
              </label>
              <select id="semanas" name="semanas" defaultValue="4" className={input}>
                <option value="2">Próximas 2</option>
                <option value="4">Próximas 4</option>
                <option value="8">Próximas 8</option>
              </select>
            </div>
            <button type="submit" className={boton}>
              Publicar calendario
            </button>
          </form>
        </section>
      )}

      {/* Nueva clase */}
      <section className="space-y-4">
        <h2 className="font-semibold">Nueva clase</h2>
        <form action={crearClase} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="hipica_id" value={id} />
          <div className="space-y-1 sm:col-span-2">
            <label htmlFor="titulo" className="text-sm font-semibold">
              Nombre de la clase
            </label>
            <input id="titulo" name="titulo" required maxLength={120} placeholder="Iniciación" className={input} />
          </div>
          <div className="space-y-1">
            <label htmlFor="dia_semana" className="text-sm font-semibold">
              Día
            </label>
            <select id="dia_semana" name="dia_semana" required defaultValue="1" className={input}>
              {DIAS.map((d, i) => (
                <option key={d} value={i + 1}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="hora_inicio" className="text-sm font-semibold">
              Hora de inicio
            </label>
            <input id="hora_inicio" name="hora_inicio" type="time" required defaultValue="18:00" className={input} />
          </div>
          <div className="space-y-1">
            <label htmlFor="duracion_min" className="text-sm font-semibold">
              Duración (min)
            </label>
            <input id="duracion_min" name="duracion_min" type="number" required min={15} max={480} step={15} defaultValue={60} className={input} />
          </div>
          <div className="space-y-1">
            <label htmlFor="plazas" className="text-sm font-semibold">
              Plazas
            </label>
            <input id="plazas" name="plazas" type="number" required min={1} max={100} defaultValue={6} className={input} />
          </div>
          <div className="space-y-1">
            <label htmlFor="nivel" className="text-sm font-semibold">
              Nivel <span className="font-normal text-tinta-suave">(opcional)</span>
            </label>
            <input id="nivel" name="nivel" maxLength={60} placeholder="Principiante" className={input} />
          </div>
          <div className="space-y-1">
            <label htmlFor="monitor_id" className="text-sm font-semibold">
              Monitor <span className="font-normal text-tinta-suave">(opcional)</span>
            </label>
            <select id="monitor_id" name="monitor_id" defaultValue="" className={input}>
              <option value="">Sin asignar</option>
              {(equipo ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className={boton}>
              Añadir clase
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function textoAviso(q: Record<string, string | string[] | undefined>) {
  if (q.ok === "creada") return { tipo: "ok", texto: "Clase añadida al horario." };
  if (typeof q.generadas === "string") {
    const n = Number(q.generadas);
    return {
      tipo: "ok",
      texto:
        n === 0
          ? "El calendario ya estaba al día: no había clases nuevas que crear."
          : `Calendario publicado: ${n} clases creadas para las próximas ${q.semanas} semanas.`,
    };
  }
  const errores: Record<string, string> = {
    datos: "Revisa los datos de la clase.",
    crear: "No se ha podido crear la clase. Vuelve a intentarlo.",
    generar: "No se ha podido publicar el calendario. Vuelve a intentarlo.",
  };
  if (typeof q.error === "string" && errores[q.error]) {
    return { tipo: "error", texto: errores[q.error] };
  }
  return null;
}
