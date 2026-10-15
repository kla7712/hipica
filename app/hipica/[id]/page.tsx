import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient, getUserId } from "@/lib/supabase/server";
import { Pantalla, Volver } from "@/components/app/ui";
import { DIAS_VISTA, HorarioVista, type Sesion } from "./vista";

export default function HorarioPage({ params, searchParams }: PageProps<"/hipica/[id]">) {
  return (
    <Pantalla>
      <Volver href="/">Tus hípicas</Volver>
      <Suspense fallback={<p className="mt-8 text-tinta-suave">Cargando horario…</p>}>
        <Contenido params={params} searchParams={searchParams} />
      </Suspense>
    </Pantalla>
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

  // Desde 12 h atrás, para que el monitor vea también las clases de hoy ya empezadas.
  const ahora = new Date();
  const desde = new Date(ahora.getTime() - 12 * 36e5);
  const hasta = new Date(ahora.getTime() + DIAS_VISTA * 864e5);
  const { data, error } = await supabase.rpc("horario", {
    p_hipica: id,
    p_desde: desde.toISOString(),
    p_hasta: hasta.toISOString(),
  });
  if (error) throw new Error(error.message);
  const sesiones = (data ?? []) as Sesion[];

  return (
    <HorarioVista
      id={id}
      hipica={yo.hipicas}
      rol={yo.rol}
      sesiones={sesiones}
      aviso={typeof aviso === "string" ? aviso : undefined}
      ahora={ahora}
    />
  );
}
