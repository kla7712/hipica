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
  // Caballos de los que soy propietario (yo o alguien a mi cargo). Vacío para el equipo.
  misCaballos: { id: string; nombre: string }[];
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

  const esStaff = yo.rol === "admin" || yo.rol === "monitor";
  const { data: caballos } = esStaff
    ? { data: [] }
    : await supabase
        .from("caballos")
        .select("id, nombre")
        .eq("hipica_id", hipicaId)
        .order("nombre")
        .returns<{ id: string; nombre: string }[]>();

  return {
    supabase,
    userId,
    demo: esCuentaDemo(sesion?.claims?.email),
    yo: { id: yo.id, nombre: yo.nombre, rol: yo.rol },
    hipica: yo.hipicas,
    esAdmin: yo.rol === "admin",
    esStaff,
    misCaballos: caballos ?? [],
  };
}

export type Seccion = "inicio" | "horario" | "caballos" | "miembros" | "ajustes" | "familia" | "servicios" | null;

export function navegacion(ctx: Pick<Contexto, "hipica" | "yo" | "misCaballos">, activa: Seccion): ItemNav[] {
  const base = `/hipica/${ctx.hipica.id}`;
  const rol = ctx.yo.rol;
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
      ...(ctx.misCaballos.length ? [item("servicios", `${base}/servicios`, "Servicios", "herradura")] : []),
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

/* ---------- Caballos ---------- */

export const UBICACIONES: Record<string, string> = {
  box: "En el box",
  paddock: "En el paddock",
  pista: "En la pista",
  fuera: "Fuera de la hípica",
};

export const PUPILAJES: Record<string, string> = {
  completo: "Pupilaje completo",
  semi: "Semipupilaje",
  box: "Solo box",
};

export const CUIDADOS: Record<string, string> = {
  herrador: "Herrador",
  vacuna: "Vacuna",
  desparasitacion: "Desparasitación",
  dentista: "Dentista",
  veterinario: "Veterinario",
  otro: "Otro",
};

// Días entre dos fechas "AAAA-MM-DD".
export const diasEntre = (desde: string, hasta: string) =>
  Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 864e5);

// "Hoy", "Mañana", "En 4 días", "Hace 2 días" y su color.
export function cuandoToca(fecha: string, hoy: string): { texto: string; tono: "alerta" | "atencion" | "info" | "neutro"; dias: number } {
  const d = diasEntre(hoy, fecha);
  if (d < 0) return { texto: d === -1 ? "Venció ayer" : `Venció hace ${-d} días`, tono: "alerta", dias: d };
  if (d === 0) return { texto: "Hoy", tono: "atencion", dias: d };
  if (d === 1) return { texto: "Mañana", tono: "atencion", dias: d };
  if (d <= 7) return { texto: `En ${d} días`, tono: "info", dias: d };
  return { texto: `En ${d} días`, tono: "neutro", dias: d };
}

export const euros = (n: number | string | null) =>
  n === null ? "Según tarifa" : Number(n) === 0 ? "Incluido" : `${Number(n).toLocaleString("es-ES", { maximumFractionDigits: 2 })} €`;
