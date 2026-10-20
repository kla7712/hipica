import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getUserId } from "@/lib/supabase/server";
import { Pantalla, botonSecundario } from "@/components/app/ui";

const ROLES = { admin: "Administrador", monitor: "Monitor", alumno: "Alumno" } as const;

type Membresia = {
  rol: keyof typeof ROLES;
  hipicas: { id: string; nombre: string } | null;
};

export default function InicioPage() {
  return (
    <Pantalla>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight [font-stretch:85%] sm:text-4xl">Tus hípicas</h1>
        <Link href="/cuenta" className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-tinta-suave hover:text-tinta">
          Mi cuenta
        </Link>
      </div>

      <Suspense fallback={<p className="mt-8 text-tinta-suave">Cargando…</p>}>
        <ListaHipicas />
      </Suspense>
    </Pantalla>
  );
}

async function ListaHipicas() {
  const userId = await getUserId();
  if (!userId) redirect("/login");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("miembros")
    .select("rol, hipicas(id, nombre)")
    .eq("user_id", userId)
    .eq("activo", true)
    .returns<Membresia[]>();

  if (error) throw new Error(error.message);
  if (!data.length) redirect("/nueva-hipica");

  return (
    <ul className="mt-8 space-y-4">
      {data.map(
        (m) =>
          m.hipicas && (
            <li key={m.hipicas.id} className="overflow-hidden rounded-xl border border-linea bg-white">
              <Link
                href={`/hipica/${m.hipicas.id}`}
                className="group flex items-center justify-between gap-4 px-5 py-5 hover:bg-alfalfa-suave"
              >
                <div className="min-w-0">
                  <p className="truncate text-xl font-bold [font-stretch:85%]">{m.hipicas.nombre}</p>
                  <p className="text-sm text-tinta-suave">{ROLES[m.rol]}</p>
                </div>
                <span className="shrink-0 font-semibold text-cuadra">
                  Ver horario
                  <svg aria-hidden="true" viewBox="0 0 16 16" className="ml-1 inline size-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="m6 3 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </Link>
              {m.rol === "admin" && (
                <div className="flex flex-wrap gap-2 border-t border-linea bg-limo/50 px-5 py-3">
                  <Link href={`/hipica/${m.hipicas.id}/clases`} className={`${botonSecundario} flex-1 sm:flex-none`}>
                    Clases
                  </Link>
                  <Link href={`/hipica/${m.hipicas.id}/miembros`} className={`${botonSecundario} flex-1 sm:flex-none`}>
                    Miembros
                  </Link>
                  <Link href={`/hipica/${m.hipicas.id}/ajustes`} className={`${botonSecundario} flex-1 sm:flex-none`}>
                    Ajustes
                  </Link>
                </div>
              )}
            </li>
          ),
      )}
    </ul>
  );
}
