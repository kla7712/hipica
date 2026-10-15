import { Suspense } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createClient, getUserId } from "@/lib/supabase/server";
import { borrarInvitacion, crearInvitacion } from "./actions";

const ROLES: Record<string, string> = { admin: "Administrador", monitor: "Monitor", alumno: "Alumno" };

type Miembro = { id: string; nombre: string; rol: string; telefono: string | null };
type Invitacion = { id: string; rol: string; token: string; usos: number; usos_max: number | null; expira_en: string };

export default function MiembrosPage({ params, searchParams }: PageProps<"/hipica/[id]/miembros">) {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <Link href="/" className="text-sm text-neutral-600 hover:text-neutral-900">
        ← Tus hípicas
      </Link>
      <Suspense fallback={<p className="mt-6 text-sm text-neutral-500">Cargando…</p>}>
        <Contenido params={params} searchParams={searchParams} />
      </Suspense>
    </main>
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
    return <p className="mt-6">Solo el administrador puede gestionar los miembros.</p>;
  }

  const ahora = new Date().toISOString();
  const [{ data: miembros }, { data: invitaciones }] = await Promise.all([
    supabase
      .from("miembros")
      .select("id, nombre, rol, telefono")
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

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  const base = `${proto}://${host}`;

  const activas = (invitaciones ?? []).filter((i) => i.usos_max === null || i.usos < i.usos_max);
  const fFecha = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long" });

  return (
    <div className="mt-4 space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Miembros</h1>
        <p className="text-sm text-neutral-600">{yo.hipicas?.nombre}</p>
      </div>

      {errorQuery === "invitar" && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          No se ha podido crear la invitación. Vuelve a intentarlo.
        </p>
      )}

      {/* Invitar */}
      <section className="space-y-4">
        <div>
          <h2 className="font-semibold">Invitar</h2>
          <p className="text-sm text-neutral-600">
            Comparte el enlace por WhatsApp. Quien lo abra entra con su email y queda unido a tu hípica.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <form action={crearInvitacion}>
            <input type="hidden" name="hipica_id" value={id} />
            <input type="hidden" name="rol" value="alumno" />
            <button type="submit" className="rounded-lg bg-neutral-900 px-4 py-2.5 font-medium text-white hover:bg-neutral-800">
              Enlace para alumnos
            </button>
          </form>
          <form action={crearInvitacion}>
            <input type="hidden" name="hipica_id" value={id} />
            <input type="hidden" name="rol" value="monitor" />
            <button type="submit" className="rounded-lg border border-neutral-300 px-4 py-2.5 font-medium hover:bg-neutral-50">
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
                <li key={inv.id} className="space-y-3 rounded-lg border border-neutral-200 p-4">
                  <p className="text-sm">
                    <span className="font-medium">{inv.rol === "alumno" ? "Alumnos" : "Monitor"}</span>
                    <span className="text-neutral-600">
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
                    className="w-full rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 font-mono text-xs"
                  />
                  <div className="flex flex-wrap gap-3">
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(texto)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
                    >
                      Enviar por WhatsApp
                    </a>
                    <form action={borrarInvitacion}>
                      <input type="hidden" name="hipica_id" value={id} />
                      <input type="hidden" name="invitacion_id" value={inv.id} />
                      <button type="submit" className="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">
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
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
          {(miembros ?? []).map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-4 p-4">
              <div>
                <p className="font-medium">{m.nombre}</p>
                {m.telefono && <p className="text-sm text-neutral-600">{m.telefono}</p>}
              </div>
              <span className="text-sm text-neutral-600">{ROLES[m.rol] ?? m.rol}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
