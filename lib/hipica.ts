// Datos comunes a todas las pantallas de una hípica: quién soy, qué rol
// tengo y los datos de la hípica. También la barra de navegación.
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { esCuentaDemo } from "@/lib/demo";
import { UUID } from "@/lib/rutas";
import type { ItemNav } from "@/components/app/ui";

export type Rol = "admin" | "monitor" | "alumno";

export type Hipica = {
  id: string;
  nombre: string;
  zona_horaria: string;
  horas_minimas_anulacion: number;
  exigir_bono: boolean;
};

export type Contexto = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  demo: boolean;
  yo: { id: string; nombre: string; rol: Rol };
  hipica: Hipica;
  esAdmin: boolean;
  esStaff: boolean;
};

export async function cargarContexto(hipicaId: string): Promise<Contexto> {
  if (!UUID.test(hipicaId)) notFound();
  const supabase = await createClient();
  const { data: sesion } = await supabase.auth.getClaims();
  const userId = sesion?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: yo } = await supabase
    .from("miembros")
    .select("id, nombre, rol, hipicas(id, nombre, zona_horaria, horas_minimas_anulacion, exigir_bono)")
    .eq("hipica_id", hipicaId)
    .eq("user_id", userId)
    .eq("activo", true)
    .maybeSingle<{ id: string; nombre: string; rol: Rol; hipicas: Hipica | null }>();
  if (!yo?.hipicas) notFound();

  return {
    supabase,
    userId,
    demo: esCuentaDemo(sesion?.claims?.email),
    yo: { id: yo.id, nombre: yo.nombre, rol: yo.rol },
    hipica: yo.hipicas,
    esAdmin: yo.rol === "admin",
    esStaff: yo.rol === "admin" || yo.rol === "monitor",
  };
}

export type Seccion = "inicio" | "horario" | "caballos" | "miembros" | "ajustes" | "familia" | null;

export function navegacion(hipicaId: string, rol: Rol, activa: Seccion): ItemNav[] {
  const base = `/hipica/${hipicaId}`;
  const item = (s: Exclude<Seccion, null>, href: string, texto: string, icono: ItemNav["icono"]): ItemNav => ({
    href,
    texto,
    icono,
    activo: activa === s,
  });
  if (rol === "alumno") {
    return [
      item("inicio", base, "Inicio", "inicio"),
      item("horario", `${base}/horario`, "Reservar", "calendario"),
      item("familia", `${base}/familia`, "Familia", "personas"),
    ];
  }
  const nav = [
    item("inicio", base, "Hoy", "inicio"),
    item("horario", `${base}/horario`, "Clases", "calendario"),
    item("caballos", `${base}/caballos`, "Caballos", "herradura"),
  ];
  if (rol === "admin") {
    nav.push(item("miembros", `${base}/miembros`, "Alumnos", "personas"), item("ajustes", `${base}/ajustes`, "Ajustes", "ajustes"));
  }
  return nav;
}

/* ---------- Fechas en la zona horaria de la hípica ---------- */

export function fechas(tz: string) {
  const clave = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  const largo = new Intl.DateTimeFormat("es-ES", { timeZone: tz, weekday: "long", day: "numeric", month: "long" });
  const medio = new Intl.DateTimeFormat("es-ES", { timeZone: tz, weekday: "long", day: "numeric", month: "short" });
  const hora = new Intl.DateTimeFormat("es-ES", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
  const semana = new Intl.DateTimeFormat("es-ES", { timeZone: tz, weekday: "short" });
  const numero = new Intl.DateTimeFormat("es-ES", { timeZone: tz, day: "numeric" });
  return {
    clave: (d: Date | string) => clave.format(new Date(d)),
    largo: (d: Date | string) => largo.format(new Date(d)),
    medio: (d: Date | string) => medio.format(new Date(d)).replace(".", ""),
    hora: (d: Date | string) => hora.format(new Date(d)),
    corto: (d: Date | string) => semana.format(new Date(d)).replace(".", "").slice(0, 3),
    numero: (d: Date | string) => numero.format(new Date(d)),
  };
}

// "jueves, 22 de octubre" → "Jueves, 22 de octubre".
export const capitalizar = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

// Primer nombre ("Marta López" → "Marta").
export const nombrePila = (n: string) => n.trim().split(/\s+/)[0] ?? n;

// "Lucía y Pablo", "Ana, Luis y Eva".
export const unir = (nombres: string[]) =>
  nombres.length <= 1 ? (nombres[0] ?? "") : `${nombres.slice(0, -1).join(", ")} y ${nombres.at(-1)}`;

export const NIVELES = ["Iniciación", "Galope 1", "Galope 2", "Galope 3", "Galope 4", "Galope 5", "Galope 6", "Galope 7"];

export const TIPOS_CLASE: Record<string, string> = {
  grupo: "Clase de grupo",
  particular: "Clase particular",
  libre: "Pista libre",
};
