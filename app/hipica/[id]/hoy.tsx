import type { ReactNode } from "react";
import Link from "next/link";
import {
  Aviso,
  Barra,
  Cabecera,
  Chip,
  ChipOcupacion,
  Cifras,
  Filtros,
  Hora,
  Icono,
  PantallaApp,
  Seccion,
  Vacio,
  tarjeta,
} from "@/components/app/ui";
import { fechas, navegacion, type Contexto } from "@/lib/hipica";
import { resumenBono, type EstadoBono, type SesionHorario } from "@/lib/tipos";
import { textoAviso } from "@/lib/avisos";
import { Tablon } from "./tablon";

type Alerta = { titulo: string; detalle: string; href: string; tono: "atencion" | "info" };
type Caballo = { id: string; nombre: string; disponible: boolean; max_clases_dia: number };

// Pantalla "Hoy" del equipo (admin y monitores).
export async function Hoy({ ctx, pista, aviso }: { ctx: Contexto; pista?: string; aviso?: string | string[] }) {
  const { supabase, hipica } = ctx;
  const f = fechas(hipica.zona_horaria);
  const ahora = new Date();
  const hoy = f.clave(ahora);
  const manana = f.clave(new Date(ahora.getTime() + 864e5));
  const base = `/hipica/${hipica.id}`;

  const [{ data: horario, error }, { data: caballos }, { data: bonos }] = await Promise.all([
    supabase.rpc("horario", {
      p_hipica: hipica.id,
      p_desde: new Date(ahora.getTime() - 16 * 36e5).toISOString(),
      p_hasta: new Date(ahora.getTime() + 48 * 36e5).toISOString(),
    }),
    supabase
      .from("caballos")
      .select("id, nombre, disponible, max_clases_dia")
      .eq("hipica_id", hipica.id)
      .eq("activo", true)
      .returns<Caballo[]>(),
    supabase.rpc("estado_bonos", { p_hipica: hipica.id }),
  ]);
  if (error) throw new Error(error.message);

  const sesiones = (horario ?? []) as SesionHorario[];
  const deHoy = sesiones.filter((s) => f.clave(s.inicio) === hoy);
  const proximas = sesiones.filter((s) => [hoy, manana].includes(f.clave(s.inicio)) && !s.cancelada);

  // Caballos asignados en las clases de hoy y mañana.
  const ids = proximas.map((s) => s.id);
  const { data: reservas } = ids.length
    ? await supabase
        .from("reservas")
        .select("sesion_id, caballo_id")
        .in("sesion_id", ids)
        .eq("estado", "confirmada")
        .returns<{ sesion_id: string; caballo_id: string | null }[]>()
    : { data: [] };
  const porCaballo = new Map((caballos ?? []).map((c) => [c.id, c]));

  /* ---------- Avisos de lo que necesita atención ---------- */
  const alertas: Alerta[] = [];
  const cuando = (s: SesionHorario) => `${f.clave(s.inicio) === hoy ? "Hoy" : "Mañana"} ${f.hora(s.inicio)}`;

  for (const s of proximas) {
    if (new Date(s.fin) < ahora || s.tipo === "libre") continue;
    const faltan = (reservas ?? []).filter((r) => r.sesion_id === s.id && !r.caballo_id).length;
    if (faltan > 0) {
      alertas.push({
        titulo: `Caballos sin asignar · ${s.titulo}`,
        detalle: `${cuando(s)}${s.pista ? ` · ${s.pista}` : ""} · ${faltan === 1 ? "falta 1" : `faltan ${faltan}`}`,
        href: `${base}/sesion/${s.id}`,
        tono: "info",
      });
    }
  }

  const usosHoy = new Map<string, number>();
  for (const r of reservas ?? []) {
    const s = proximas.find((x) => x.id === r.sesion_id);
    if (!r.caballo_id || !s || f.clave(s.inicio) !== hoy) continue;
    usosHoy.set(r.caballo_id, (usosHoy.get(r.caballo_id) ?? 0) + 1);
  }
  for (const [id, usos] of usosHoy) {
    const c = porCaballo.get(id);
    if (!c) continue;
    if (!c.disponible) {
      alertas.push({
        titulo: `${c.nombre} está en reposo`,
        detalle: `Pero tiene ${usos === 1 ? "1 clase" : `${usos} clases`} hoy. Cámbialo por otro caballo.`,
        href: `${base}/caballos`,
        tono: "atencion",
      });
    } else if (usos > c.max_clases_dia) {
      alertas.push({
        titulo: `${c.nombre} · ${usos} clases hoy`,
        detalle: `Su máximo es de ${c.max_clases_dia} al día`,
        href: `${base}/caballos`,
        tono: "atencion",
      });
    }
  }

  for (const s of proximas) {
    if (s.en_espera > 0 && s.ocupadas >= s.plazas && new Date(s.inicio) > ahora) {
      alertas.push({
        titulo: `${s.titulo} · completa`,
        detalle: `${cuando(s)} · ${s.en_espera} en lista de espera`,
        href: `${base}/sesion/${s.id}`,
        tono: "info",
      });
    }
  }

  const hoyFecha = hoy;
  const renovar = ((bonos ?? []) as EstadoBono[]).filter((b) => b.bono_id && resumenBono(b, hoyFecha).renovar);
  if (renovar.length > 0 && ctx.esAdmin) {
    alertas.push({
      titulo: renovar.length === 1 ? "1 bono por renovar" : `${renovar.length} bonos por renovar`,
      detalle: `${renovar
        .slice(0, 3)
        .map((b) => b.nombre)
        .join(", ")}${renovar.length > 3 ? "…" : ""}`,
      href: `${base}/miembros?f=renovar`,
      tono: "atencion",
    });
  }
  alertas.sort((a, b) => (a.tono === b.tono ? 0 : a.tono === "atencion" ? -1 : 1));

  /* ---------- Clases de hoy, filtrables por pista ---------- */
  const pistas = [...new Set(deHoy.map((s) => s.pista).filter((p): p is string => !!p))];
  const filtro = pista && pistas.includes(pista) ? pista : null;
  const lista = filtro ? deHoy.filter((s) => s.pista === filtro) : deHoy;
  const activas = deHoy.filter((s) => !s.cancelada);
  const mensaje = textoAviso(aviso);

  return (
    <PantallaApp
      nav={navegacion(hipica.id, ctx.yo.rol, "inicio")}
      cabecera={
        <Cabecera antetitulo={hipica.nombre} titulo={f.largo(ahora)} demo={ctx.demo}>
          <Cifras
            items={[
              { valor: activas.length, texto: activas.length === 1 ? "clase hoy" : "clases hoy" },
              { valor: activas.reduce((n, s) => n + s.ocupadas, 0), texto: "jinetes hoy" },
              { valor: alertas.length, texto: alertas.length === 1 ? "aviso" : "avisos", href: "#atencion" },
            ]}
          />
        </Cabecera>
      }
    >
      {mensaje && <Aviso tipo="error">{mensaje}</Aviso>}

      {alertas.length > 0 && (
        <Seccion titulo="Necesita atención" id="atencion">
          <ul className={`${tarjeta} divide-y divide-linea overflow-hidden`}>
            {alertas.map((a, i) => (
              <li key={i}>
                <Link href={a.href} className="flex items-center gap-3 px-4 py-3.5 hover:bg-limo">
                  <span
                    aria-hidden="true"
                    className={`size-2.5 shrink-0 rounded-full ${a.tono === "atencion" ? "bg-punto-atencion" : "bg-punto-info"}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">{a.titulo}</span>
                    <span className="block text-sm text-tinta-suave">{a.detalle}</span>
                  </span>
                  <Icono nombre="flecha" className="size-5 shrink-0 text-tinta-suave" />
                </Link>
              </li>
            ))}
          </ul>
        </Seccion>
      )}

      <Seccion
        titulo="Clases de hoy"
        id="hoy"
        accion={
          <Link href={`${base}/horario`} className="text-sm font-bold text-cuadra hover:underline">
            Ver semana
          </Link>
        }
      >
        {pistas.length > 1 && (
          <div className="mb-3">
            <Filtros
              opciones={[
                { texto: "Todas", href: base, activo: !filtro },
                ...pistas.map((p) => ({ texto: p, href: `${base}?pista=${encodeURIComponent(p)}`, activo: filtro === p })),
              ]}
            />
          </div>
        )}
        {lista.length === 0 ? (
          <Vacio>
            Hoy no hay clases.{" "}
            <Link href={`${base}/horario`} className="font-bold text-cuadra underline">
              Ver los próximos días
            </Link>
          </Vacio>
        ) : (
          <ul className="space-y-2.5">
            {lista.map((s) => (
              <FilaClase key={s.id} s={s} href={`${base}/sesion/${s.id}`} hora={f.hora(s.inicio)} ahora={ahora} />
            ))}
          </ul>
        )}
      </Seccion>

      <Tablon ctx={ctx} volver={base} />
    </PantallaApp>
  );
}

// Una clase en la lista del equipo: enlace a su lista de alumnos.
export function FilaClase({
  s,
  href,
  hora,
  ahora,
  extra,
}: {
  s: SesionHorario;
  href: string;
  hora: string;
  ahora: Date;
  extra?: ReactNode;
}) {
  const terminada = new Date(s.fin) < ahora;
  const apagada = terminada || s.cancelada;
  return (
    <li className="flex gap-3">
      <Hora inicio={hora} apagada={apagada} />
      <Link href={href} className={`${tarjeta} block min-w-0 flex-1 p-4 hover:ring-1 hover:ring-linea`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={`font-extrabold ${s.cancelada ? "text-tinta-suave line-through" : apagada ? "text-tinta-suave" : ""}`}>
              {s.titulo}
            </p>
            <p className="text-sm text-tinta-suave">
              {[s.pista, s.monitor, s.tipo === "grupo" ? s.nivel : null].filter(Boolean).join(" · ") || "Sin pista"}
            </p>
          </div>
          {terminada && !s.cancelada ? (
            <Chip>Terminada</Chip>
          ) : (
            <ChipOcupacion ocupadas={s.ocupadas} plazas={s.plazas} enEspera={s.en_espera} tipo={s.tipo} cancelada={s.cancelada} />
          )}
        </div>
        {!s.cancelada && s.tipo !== "particular" && (
          <div className="mt-3">
            <Barra ocupadas={s.ocupadas} plazas={s.plazas} />
          </div>
        )}
        {extra}
      </Link>
    </li>
  );
}
