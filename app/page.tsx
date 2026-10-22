import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getUserId } from "@/lib/supabase/server";
import { Cabecera, CargandoApp, Icono, PantallaApp, tarjeta } from "@/components/app/ui";

const ROLES = { admin: "Administrador", monitor: "Monitor", alumno: "Alumno" } as const;

type Membresia = {
  rol: keyof typeof ROLES;
  hipicas: { id: string; nombre: string } | null;
};

// Con una sola hípica (lo normal) se entra directamente en ella.
export default function InicioPage() {
  return (
    <Suspense fallback={<CargandoApp />}>
      <ListaHipicas />
    </Suspense>
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
  const hipicas = data.filter((m) => m.hipicas);
  if (hipicas.length === 0) {
    // ¿Ha pedido el alta en alguna hípica y está esperando?
    const { data: altas } = await supabase
      .from("altas")
      .select("estado, created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .returns<{ estado: string; created_at: string }[]>();
    const alta = altas?.[0];
    if (alta && alta.estado !== "aprobada") {
      return (
        <PantallaApp cabecera={<Cabecera titulo={alta.estado === "pendiente" ? "Solicitud enviada" : "Alta no aprobada"} />}>
          <div className={`${tarjeta} space-y-3 p-5`}>
            {alta.estado === "pendiente" ? (
              <>
                <p className="text-lg font-bold">¡Gracias! La hípica está revisando tu alta.</p>
                <p className="text-tinta-suave">
                  Cuando la apruebe, entra aquí con tu email y podrás reservar clases. No hace falta que hagas nada más.
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-bold">La hípica no ha aprobado tu alta.</p>
                <p className="text-tinta-suave">Habla con ellos para saber por qué o para volver a intentarlo.</p>
              </>
            )}
          </div>
          <p className="mt-6 text-sm text-tinta-suave">
            ¿Tienes tu propia hípica?{" "}
            <Link href="/nueva-hipica" className="font-bold text-cuadra underline">
              Créala aquí
            </Link>
          </p>
        </PantallaApp>
      );
    }
    redirect("/nueva-hipica");
  }
  if (hipicas.length === 1) redirect(`/hipica/${hipicas[0].hipicas!.id}`);

  return (
    <PantallaApp cabecera={<Cabecera titulo="Tus hípicas" detalle="Elige en cuál quieres entrar." />}>
      <ul className={`${tarjeta} divide-y divide-linea overflow-hidden`}>
        {hipicas.map((m) => (
          <li key={m.hipicas!.id}>
            <Link href={`/hipica/${m.hipicas!.id}`} className="flex items-center gap-3 px-4 py-4 hover:bg-limo">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-lg font-extrabold">{m.hipicas!.nombre}</span>
                <span className="block text-sm text-tinta-suave">{ROLES[m.rol]}</span>
              </span>
              <Icono nombre="flecha" className="size-5 text-tinta-suave" />
            </Link>
          </li>
        ))}
      </ul>
    </PantallaApp>
  );
}
