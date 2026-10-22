import { Suspense } from "react";
import { redirect } from "next/navigation";
import { CargandoApp } from "@/components/app/ui";
import { cargarContexto } from "@/lib/hipica";
import { Hoy } from "./hoy";
import { Inicio } from "./inicio";

// Primera pantalla de la hípica: "Hoy" para el equipo, "Inicio" para alumnos y familias.
export default function HipicaPage({ params, searchParams }: PageProps<"/hipica/[id]">) {
  return (
    <Suspense fallback={<CargandoApp />}>
      <Contenido params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Contenido({ params, searchParams }: PageProps<"/hipica/[id]">) {
  const { id } = await params;
  const { pista, aviso } = await searchParams;
  const ctx = await cargarContexto(id);
  if (ctx.yo.rol === "cuadra") redirect(`/hipica/${id}/cuadra`);
  return ctx.esStaff ? (
    <Hoy ctx={ctx} pista={typeof pista === "string" ? pista : undefined} aviso={aviso} />
  ) : (
    <Inicio ctx={ctx} aviso={aviso} />
  );
}
