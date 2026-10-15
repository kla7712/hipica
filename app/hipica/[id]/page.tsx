import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient, getUserId } from "@/lib/supabase/server";
import { anular, reservar } from "./actions";

type Sesion = {
  id: string;
  titulo: string;
  nivel: string | null;
  inicio: string;
  fin: string;
  plazas: number;
  ocupadas: number;
  cancelada: boolean;
  monitor: string | null;
  mi_reserva: string | null;
};

const DIAS_VISTA = 14;

export default function HorarioPage({ params, searchParams }: PageProps<"/hipica/[id]">) {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <Link href="/" className="text-sm text-neutral-600 hover:text-neutral-900">
        ← Tus hípicas
      </Link>
      <Suspense fallback={<p className="mt-6 text-sm text-neutral-500">Cargando horario…</p>}>
        <Contenido params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Contenido({ params, searchParams }: PageProps<"/hipica/[id]">) {
  const { id } = await params;
  const { aviso } = await searchParams;

  const userId = await getUserId();
  if (!userId) redirect("/login");

  const supabase = await createClient();
  const { data: yo } = await supabase
    .from("miembros")
    .select("rol, hipicas(nombre, zona_horaria, horas_minimas_anulacion)")
    .eq("hipica_id", id)
    .eq("user_id", userId)
    .maybeSingle<{
      rol: string;
      hipicas: { nombre: string; zona_horaria: string; horas_minimas_anulacion: number } | null;
    }>();
  if (!yo?.hipicas) notFound();

  const ahora = new Date();
  const hasta = new Date(ahora.getTime() + DIAS_VISTA * 864e5);
  const { data, error } = await supabase.rpc("horario", {
    p_hipica: id,
    p_desde: ahora.toISOString(),
    p_hasta: hasta.toISOString(),
  });
  if (error) throw new Error(error.message);
  const sesiones = (data ?? []) as Sesion[];

  const tz = yo.hipicas.zona_horaria;
  const fDia = new Intl.DateTimeFormat("es-ES", { timeZone: tz, weekday: "long", day: "numeric", month: "long" });
  const fHora = new Intl.DateTimeFormat("es-ES", { timeZone: tz, hour: "2-digit", minute: "2-digit" });

  const dias = new Map<string, Sesion[]>();
  for (const s of sesiones) {
    const clave = fDia.format(new Date(s.inicio));
    dias.set(clave, [...(dias.get(clave) ?? []), s]);
  }

  return (
    <div className="mt-4 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{yo.hipicas.nombre}</h1>
        <p className="text-sm text-neutral-600">
          Próximos {DIAS_VISTA} días · puedes anular hasta {yo.hipicas.horas_minimas_anulacion} h antes
        </p>
      </div>

      {typeof aviso === "string" && (
        <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {aviso}
        </p>
      )}

      {dias.size === 0 && (
        <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-600">
          No hay clases publicadas para los próximos días.
        </p>
      )}

      {[...dias.entries()].map(([dia, lista]) => (
        <section key={dia} className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">{dia}</h2>
          <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
            {lista.map((s) => {
              const libres = Math.max(s.plazas - s.ocupadas, 0);
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
                  <div className="w-14 font-mono text-sm">{fHora.format(new Date(s.inicio))}</div>
                  <div className="min-w-0 flex-1">
                    <p className={`font-medium ${s.cancelada ? "text-neutral-400 line-through" : ""}`}>
                      {s.titulo}
                      {s.nivel && <span className="font-normal text-neutral-500"> · {s.nivel}</span>}
                    </p>
                    <p className="text-sm text-neutral-600">
                      {s.cancelada
                        ? "Cancelada"
                        : s.mi_reserva
                          ? "Tienes plaza"
                          : libres === 0
                            ? "Completa"
                            : `${libres} ${libres === 1 ? "plaza libre" : "plazas libres"}`}
                      {s.monitor && ` · ${s.monitor}`}
                    </p>
                  </div>
                  {!s.cancelada && s.mi_reserva && (
                    <form action={anular}>
                      <input type="hidden" name="hipica_id" value={id} />
                      <input type="hidden" name="reserva_id" value={s.mi_reserva} />
                      <button type="submit" className="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">
                        Anular
                      </button>
                    </form>
                  )}
                  {!s.cancelada && !s.mi_reserva && libres > 0 && (
                    <form action={reservar}>
                      <input type="hidden" name="hipica_id" value={id} />
                      <input type="hidden" name="sesion_id" value={s.id} />
                      <button type="submit" className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800">
                        Reservar
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
