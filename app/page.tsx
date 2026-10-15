import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getUserId } from "@/lib/supabase/server";
import { cerrarSesion } from "./actions";

const ROLES = { admin: "Administrador", monitor: "Monitor", alumno: "Alumno" } as const;

type Membresia = {
  rol: keyof typeof ROLES;
  hipicas: { id: string; nombre: string } | null;
};

// La cabecera se sirve al instante; la lista depende del usuario y va en <Suspense>.
export default function InicioPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Tus hípicas</h1>
        <form action={cerrarSesion}>
          <button
            type="submit"
            className="rounded-lg px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100"
          >
            Cerrar sesión
          </button>
        </form>
      </div>

      <Suspense fallback={<p className="mt-6 text-sm text-neutral-500">Cargando…</p>}>
        <ListaHipicas />
      </Suspense>
    </main>
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
    <ul className="mt-6 space-y-3">
      {data.map((m) => (
        <li key={m.hipicas?.id} className="rounded-lg border border-neutral-200">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-medium">{m.hipicas?.nombre}</p>
              <p className="text-sm text-neutral-600">{ROLES[m.rol]}</p>
            </div>
            {m.rol === "admin" && m.hipicas && (
              <Link
                href={`/hipica/${m.hipicas.id}/clases`}
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50"
              >
                Clases
              </Link>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
