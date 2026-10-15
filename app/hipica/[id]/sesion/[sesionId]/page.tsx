import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient, getUserId } from "@/lib/supabase/server";
import { Pantalla, Volver } from "@/components/app/ui";
import { cambiarCancelacion, marcarAsistencia, quitarAlumno } from "./actions";

type Sesion = {
  id: string;
  titulo: string;
  inicio: string;
  fin: string;
  plazas: number;
  cancelada: boolean;
  monitor: { nombre: string } | null;
};

type Reserva = {
  id: string;
  asistio: boolean | null;
  alumno: { nombre: string; telefono: string | null } | null;
};

const botonBase = "inline-flex min-h-11 items-center rounded-lg border px-3 text-sm font-semibold";

export default function SesionPage({ params, searchParams }: PageProps<"/hipica/[id]/sesion/[sesionId]">) {
  return (
    <Pantalla>
      <Suspense fallback={<p className="text-sm text-tinta-suave">Cargando…</p>}>
        <Contenido params={params} searchParams={searchParams} />
      </Suspense>
    </Pantalla>
  );
}

async function Contenido({ params, searchParams }: PageProps<"/hipica/[id]/sesion/[sesionId]">) {
  const { id, sesionId } = await params;
  const { error: errorQuery } = await searchParams;

  const userId = await getUserId();
  if (!userId) redirect("/login");

  const supabase = await createClient();
  const { data: yo } = await supabase
    .from("miembros")
    .select("rol, hipicas(zona_horaria)")
    .eq("hipica_id", id)
    .eq("user_id", userId)
    .maybeSingle<{ rol: string; hipicas: { zona_horaria: string } | null }>();
  if (!yo) notFound();

  const volver = (
    <Volver href={`/hipica/${id}`}>Horario</Volver>
  );
  if (yo.rol === "alumno") {
    return (
      <>
        {volver}
        <p className="mt-8 text-tinta-suave">Solo el administrador y los monitores pueden ver la lista de asistentes.</p>
      </>
    );
  }
  const esAdmin = yo.rol === "admin";

  const [{ data: sesion }, { data: reservas, error }] = await Promise.all([
    supabase
      .from("sesiones")
      .select("id, titulo, inicio, fin, plazas, cancelada, monitor:miembros(nombre)")
      .eq("id", sesionId)
      .eq("hipica_id", id)
      .maybeSingle<Sesion>(),
    supabase
      .from("reservas")
      .select("id, asistio, alumno:miembros(nombre, telefono)")
      .eq("sesion_id", sesionId)
      .eq("estado", "confirmada")
      .order("created_at")
      .returns<Reserva[]>(),
  ]);
  if (!sesion) notFound();
  if (error) throw new Error(error.message);

  const tz = yo.hipicas?.zona_horaria ?? "Europe/Madrid";
  const fDia = new Intl.DateTimeFormat("es-ES", { timeZone: tz, weekday: "long", day: "numeric", month: "long" });
  const fHora = new Intl.DateTimeFormat("es-ES", { timeZone: tz, hour: "2-digit", minute: "2-digit" });

  const lista = (reservas ?? []).sort((a, b) =>
    (a.alumno?.nombre ?? "").localeCompare(b.alumno?.nombre ?? "", "es"),
  );
  const vinieron = lista.filter((r) => r.asistio === true).length;
  const sinMarcar = lista.filter((r) => r.asistio === null).length;
  const empezada = new Date(sesion.inicio) <= new Date();

  return (
    <div className="space-y-8">
      {volver}

      <div className="space-y-1">
        <h1 className={`text-3xl font-bold tracking-tight [font-stretch:85%] sm:text-4xl ${sesion.cancelada ? "text-tinta-suave/60 line-through" : ""}`}>
          {sesion.titulo}
        </h1>
        <p className="text-tinta first-letter:uppercase">
          {fDia.format(new Date(sesion.inicio))} · {fHora.format(new Date(sesion.inicio))}–
          {fHora.format(new Date(sesion.fin))}
        </p>
        <p className="text-sm text-tinta-suave">
          {sesion.cancelada ? "Clase cancelada · " : ""}
          {lista.length} de {sesion.plazas} plazas ocupadas
          {sesion.monitor && ` · ${sesion.monitor.nombre}`}
        </p>
      </div>

      {/* Asistentes */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">Asistentes</h2>
          {lista.length > 0 && (
            <p className="text-sm text-tinta-suave">
              {vinieron} {vinieron === 1 ? "ha venido" : "han venido"}
              {sinMarcar > 0 && ` · ${sinMarcar} sin marcar`}
            </p>
          )}
        </div>

        {lista.length === 0 ? (
          <p className="rounded-xl border border-dashed border-linea bg-white/60 px-6 py-10 text-center text-tinta-suave">
            Nadie ha reservado todavía.
          </p>
        ) : (
          <ul className="divide-y divide-linea overflow-hidden rounded-xl border border-linea bg-white">
            {lista.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{r.alumno?.nombre ?? "Alumno"}</p>
                  {r.alumno?.telefono && (
                    <a href={`tel:${r.alumno.telefono}`} className="text-sm text-tinta-suave underline">
                      {r.alumno.telefono}
                    </a>
                  )}
                </div>

                <form action={marcarAsistencia} className="flex gap-2" aria-label={`Asistencia de ${r.alumno?.nombre ?? "alumno"}`}>
                  <input type="hidden" name="reserva_id" value={r.id} />
                  <button
                    type="submit"
                    name="asistio"
                    value={r.asistio === true ? "nada" : "si"}
                    aria-pressed={r.asistio === true}
                    className={`${botonBase} ${
                      r.asistio === true
                        ? "border-cuadra bg-cuadra text-white"
                        : "border-linea bg-white hover:border-tinta-suave"
                    }`}
                  >
                    Vino
                  </button>
                  <button
                    type="submit"
                    name="asistio"
                    value={r.asistio === false ? "nada" : "no"}
                    aria-pressed={r.asistio === false}
                    className={`${botonBase} ${
                      r.asistio === false
                        ? "border-alerta bg-alerta text-white"
                        : "border-linea bg-white hover:border-tinta-suave"
                    }`}
                  >
                    No vino
                  </button>
                </form>

                {esAdmin && !empezada && (
                  <form action={quitarAlumno}>
                    <input type="hidden" name="reserva_id" value={r.id} />
                    <button type="submit" className="rounded-lg px-3 py-2 text-sm text-tinta-suave underline hover:text-tinta">
                      Quitar
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Cancelar clase (solo admin y antes de que empiece) */}
      {esAdmin && !empezada && (
        <section className="space-y-3 rounded-xl border border-linea bg-white p-5">
          {sesion.cancelada ? (
            <>
              <p className="text-sm">Esta clase está cancelada. Los alumnos la ven como cancelada en su horario.</p>
              <form action={cambiarCancelacion}>
                <input type="hidden" name="hipica_id" value={id} />
                <input type="hidden" name="sesion_id" value={sesionId} />
                <input type="hidden" name="cancelada" value="false" />
                <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-linea bg-white px-4 text-sm font-semibold hover:border-tinta-suave">
                  Reactivar clase
                </button>
              </form>
            </>
          ) : (
            <>
              <div>
                <h2 className="font-semibold">Cancelar esta clase</h2>
                <p className="text-sm text-tinta-suave">
                  Solo este día. El resto de semanas siguen igual. Avisa a los alumnos por WhatsApp: por
                  ahora la app no les manda email.
                </p>
              </div>
              <form action={cambiarCancelacion} className="space-y-3">
                <input type="hidden" name="hipica_id" value={id} />
                <input type="hidden" name="sesion_id" value={sesionId} />
                <input type="hidden" name="cancelada" value="true" />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="confirmar" value="si" required className="size-4" />
                  Sí, quiero cancelar la clase de este día
                </label>
                {errorQuery === "confirmar" && (
                  <p className="text-sm text-alerta">Marca la casilla para confirmar.</p>
                )}
                <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-alerta px-4 text-sm font-semibold text-white hover:brightness-90">
                  Cancelar clase
                </button>
              </form>
            </>
          )}
        </section>
      )}
    </div>
  );
}
