import { Suspense } from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createClient, getUserId } from "@/lib/supabase/server";
import { Pantalla, Volver } from "@/components/app/ui";
import { anadirSinCuenta, borrarInvitacion, crearInvitacion, darDeBaja } from "./actions";

const ROLES: Record<string, string> = { admin: "Administrador", monitor: "Monitor", alumno: "Alumno" };

type Miembro = {
  id: string;
  nombre: string;
  rol: string;
  telefono: string | null;
  user_id: string | null;
  titular_id: string | null;
};
type Invitacion = { id: string; rol: string; token: string; usos: number; usos_max: number | null; expira_en: string };

export default function MiembrosPage({ params, searchParams }: PageProps<"/hipica/[id]/miembros">) {
  return (
    <Pantalla>
      <Volver href="/">Tus hípicas</Volver>
      <Suspense fallback={<p className="mt-6 text-sm text-tinta-suave">Cargando…</p>}>
        <Contenido params={params} searchParams={searchParams} />
      </Suspense>
    </Pantalla>
  );
}

async function Contenido({ params, searchParams }: PageProps<"/hipica/[id]/miembros">) {
  const { id } = await params;
  const { error: errorQuery } = await searchParams;

  const userId = await getUserId();
  if (!userId) redirect("/login");

  const supabase = await createClient();
  const { data: yo } = await supabase
    .from("miembros")
    .select("rol, hipicas(nombre)")
    .eq("hipica_id", id)
    .eq("user_id", userId)
    .maybeSingle<{ rol: string; hipicas: { nombre: string } | null }>();
  if (!yo) notFound();
  if (yo.rol !== "admin") {
    return <p className="mt-8 text-tinta-suave">Solo el administrador puede gestionar los miembros.</p>;
  }

  const ahora = new Date().toISOString();
  const [{ data: miembros }, { data: invitaciones }] = await Promise.all([
    supabase
      .from("miembros")
      .select("id, nombre, rol, telefono, user_id, titular_id")
      .eq("hipica_id", id)
      .eq("activo", true)
      .order("rol")
      .order("nombre")
      .returns<Miembro[]>(),
    supabase
      .from("invitaciones")
      .select("id, rol, token, usos, usos_max, expira_en")
      .eq("hipica_id", id)
      .gt("expira_en", ahora)
      .order("created_at", { ascending: false })
      .returns<Invitacion[]>(),
  ]);

  // Titulares primero y, justo debajo de cada uno, sus jinetes a cargo.
  const todos = miembros ?? [];
  const porId = new Map(todos.map((m) => [m.id, m]));
  const ordenados = todos
    .filter((m) => !m.titular_id)
    .flatMap((t) => [t, ...todos.filter((m) => m.titular_id === t.id)]);

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  const base = `${proto}://${host}`;

  const activas = (invitaciones ?? []).filter((i) => i.usos_max === null || i.usos < i.usos_max);
  const fFecha = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long" });

  return (
    <div className="mt-4 space-y-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight [font-stretch:85%] sm:text-4xl">Miembros</h1>
        <p className="text-sm text-tinta-suave">{yo.hipicas?.nombre}</p>
      </div>

      {errorQuery === "baja" && (
        <p className="rounded-lg border border-alerta/30 bg-alerta-suave px-4 py-3 text-sm text-alerta">
          No se ha podido dar de baja a ese miembro.
        </p>
      )}
      {errorQuery === "invitar" && (
        <p className="rounded-lg border border-alerta/30 bg-alerta-suave px-4 py-3 text-sm text-alerta">
          No se ha podido crear la invitación. Vuelve a intentarlo.
        </p>
      )}

      {/* Invitar */}
      <section className="space-y-4">
        <div>
          <h2 className="font-semibold">Invitar</h2>
          <p className="text-sm text-tinta-suave">
            Comparte el enlace por WhatsApp. Quien lo abra entra con su email y queda unido a tu hípica.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <form action={crearInvitacion}>
            <input type="hidden" name="hipica_id" value={id} />
            <input type="hidden" name="rol" value="alumno" />
            <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-cuadra px-4 font-semibold text-white hover:bg-cuadra-hover">
              Enlace para alumnos
            </button>
          </form>
          <form action={crearInvitacion}>
            <input type="hidden" name="hipica_id" value={id} />
            <input type="hidden" name="rol" value="monitor" />
            <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-linea bg-white px-4 font-semibold hover:border-tinta-suave">
              Invitar a un monitor
            </button>
          </form>
        </div>

        {activas.length > 0 && (
          <ul className="space-y-3">
            {activas.map((inv) => {
              const url = `${base}/unirse/${inv.token}`;
              const texto = `Únete a ${yo.hipicas?.nombre} para reservar tus clases: ${url}`;
              return (
                <li key={inv.id} className="space-y-3 rounded-xl border border-linea bg-white p-4">
                  <p className="text-sm">
                    <span className="font-semibold">{inv.rol === "alumno" ? "Alumnos" : "Monitor"}</span>
                    <span className="text-tinta-suave">
                      {" · "}
                      {inv.usos_max === null ? `${inv.usos} ${inv.usos === 1 ? "uso" : "usos"}` : "un solo uso"}
                      {" · caduca el "}
                      {fFecha.format(new Date(inv.expira_en))}
                    </span>
                  </p>
                  <label className="sr-only" htmlFor={`url-${inv.id}`}>
                    Enlace de invitación
                  </label>
                  <input
                    id={`url-${inv.id}`}
                    readOnly
                    value={url}
                    className="w-full rounded-lg border border-linea bg-limo px-3 py-2 text-sm text-tinta-suave"
                  />
                  <div className="flex flex-wrap gap-3">
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(texto)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center justify-center rounded-lg bg-cuadra px-4 text-sm font-semibold text-white hover:bg-cuadra-hover"
                    >
                      Enviar por WhatsApp
                    </a>
                    <form action={borrarInvitacion}>
                      <input type="hidden" name="hipica_id" value={id} />
                      <input type="hidden" name="invitacion_id" value={inv.id} />
                      <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-linea bg-white px-4 text-sm font-semibold hover:border-tinta-suave">
                        Desactivar
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Lista de miembros */}
      <section className="space-y-3">
        <h2 className="font-semibold">Miembros ({miembros?.length ?? 0})</h2>
        <p className="text-sm text-tinta-suave">
          Los jinetes a cargo de otro miembro (por ejemplo, hijos) aparecen debajo de su titular.
        </p>
        <ul className="divide-y divide-linea overflow-hidden rounded-xl border border-linea bg-white">
          {ordenados.map((m) => (
            <li
              key={m.id}
              className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 p-4 ${m.titular_id ? "bg-limo/40 pl-10" : ""}`}
            >
              <div className="min-w-0">
                <p className="font-semibold">{m.nombre}</p>
                <p className="text-sm text-tinta-suave">
                  {m.titular_id
                    ? `A cargo de ${porId.get(m.titular_id)?.nombre ?? "otro miembro"}`
                    : m.user_id
                      ? (ROLES[m.rol] ?? m.rol)
                      : "Alumno sin cuenta"}
                  {m.telefono && <>, {m.telefono}</>}
                </p>
              </div>
              {m.rol !== "admin" && (
                <details className="group text-sm">
                  <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-lg px-3 font-medium text-tinta-suave hover:text-alerta">
                    Dar de baja
                  </summary>
                  <form action={darDeBaja} className="mt-2 space-y-2 rounded-lg border border-alerta/30 bg-alerta-suave p-3">
                    <input type="hidden" name="hipica_id" value={id} />
                    <input type="hidden" name="miembro_id" value={m.id} />
                    <p className="text-alerta">
                      {m.nombre} dejará de ver la hípica y se anularán sus reservas futuras. No podrá volver a
                      entrar con un enlace.
                    </p>
                    <button type="submit" className="inline-flex min-h-11 items-center rounded-lg bg-alerta px-4 font-semibold text-white hover:brightness-90">
                      Confirmar baja
                    </button>
                  </form>
                </details>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Alumno sin cuenta */}
      <section className="space-y-4">
        <div>
          <h2 className="font-semibold">Añadir un alumno sin cuenta</h2>
          <p className="text-sm text-tinta-suave">
            Para quien reserva por teléfono o no usa el móvil. Tú le apuntas a las clases desde la lista de cada clase.
          </p>
        </div>
        {errorQuery === "sincuenta" && (
          <p className="rounded-lg border border-alerta/30 bg-alerta-suave px-4 py-3 text-sm text-alerta">
            No se ha podido añadir. Revisa el nombre.
          </p>
        )}
        <form action={anadirSinCuenta} className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
          <input type="hidden" name="hipica_id" value={id} />
          <div className="space-y-1">
            <label htmlFor="sc-nombre" className="text-sm font-semibold">
              Nombre y apellido
            </label>
            <input
              id="sc-nombre"
              name="nombre"
              required
              maxLength={120}
              className="w-full rounded-lg border border-linea bg-white px-3 py-2.5 text-base text-tinta outline-none focus:border-cuadra"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="sc-telefono" className="text-sm font-semibold">
              Teléfono <span className="font-normal text-tinta-suave">(opcional)</span>
            </label>
            <input
              id="sc-telefono"
              name="telefono"
              type="tel"
              maxLength={30}
              className="w-full rounded-lg border border-linea bg-white px-3 py-2.5 text-base text-tinta outline-none focus:border-cuadra"
            />
          </div>
          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-cuadra px-4 font-semibold text-white hover:bg-cuadra-hover"
          >
            Añadir
          </button>
        </form>
      </section>
    </div>
  );
}
