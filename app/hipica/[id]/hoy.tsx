import type { ReactNode } from "react";
import Link from "next/link";
import {
  Columna,
  Columnas,
  Aviso,
  Barra,
  Cabecera,
  Chip,
  ChipOcupacion,
  Cifras,
  Filtros,
  Hora,
  Icono,
  Meta,
  type NombreIcono,
  PantallaApp,
  Seccion,
  Vacio,
  tarjeta,
} from "@/components/app/ui";
import { CUIDADOS, cuandoToca, fechas, navegacion, type Contexto, campana } from "@/lib/hipica";
import { resumenBono, type EstadoBono, type SesionHorario } from "@/lib/tipos";
import { textoAviso } from "@/lib/avisos";
import { Tablon } from "./tablon";
import { InvitarAvisos } from "@/components/app/avisos-movil";
import { ListaSolicitudes, type Solicitud } from "./servicios/solicitudes";

type Alerta = { titulo: string; detalle: string; href: string; tono: "atencion" | "info"; icono: NombreIcono; orden: number };
type Caballo = { id: string; nombre: string; disponible: boolean; max_clases_dia: number };

// Pantalla "Hoy" del equipo (admin y monitores).
export async function Hoy({ ctx, pista, aviso }: { ctx: Contexto; pista?: string; aviso?: string | string[] }) {
  const { supabase, hipica } = ctx;
  const f = fechas(hipica.zona_horaria);
  const ahora = new Date();
  const hoy = f.clave(ahora);
  const manana = f.clave(new Date(ahora.getTime() + 864e5));
  const base = `/hipica/${hipica.id}`;

  const en7 = new Date(Date.parse(`${hoy}T12:00:00Z`) + 7 * 864e5).toISOString().slice(0, 10);
  const [{ data: horario, error }, { data: caballos }, { data: bonos }, { data: cuidados }, { data: solicitudes }] = await Promise.all([
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
    supabase
      .from("cuidados")
      .select("id, caballo_id, tipo, fecha, responsable, caballos(nombre, tipo)")
      .eq("hipica_id", hipica.id)
      .eq("hecho", false)
      .lte("fecha", en7)
      .order("fecha")
      .returns<
        { id: string; caballo_id: string; tipo: string; fecha: string; responsable: string | null; caballos: { nombre: string; tipo: string } | null }[]
      >(),
    supabase
      .from("solicitudes")
      .select("id, caballo_id, fecha, servicios, total, nota, estado, created_at")
      .eq("hipica_id", hipica.id)
      .eq("estado", "pendiente")
      .order("fecha")
      .limit(5)
      .returns<Solicitud[]>(),
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
        icono: "herradura",
        orden: 4,
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
        icono: "herradura",
        orden: 1,
      });
    } else if (usos > c.max_clases_dia) {
      alertas.push({
        titulo: `${c.nombre} · ${usos} clases hoy`,
        detalle: `Su máximo es de ${c.max_clases_dia} al día`,
        href: `${base}/caballos`,
        tono: "atencion",
        icono: "herradura",
        orden: 1,
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
        icono: "calendario",
        orden: 7,
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
      icono: "personas",
      orden: 8,
    });
  }
  // Cuidados de la próxima semana (herrador, vacunas…), primero los vencidos.
  const cuidadosAlertas: Alerta[] = (cuidados ?? []).map((c) => {
    const t = cuandoToca(c.fecha, hoy);
    const respuesta =
      c.caballos?.tipo === "propietario"
        ? c.responsable === "hipica"
          ? " · se encarga la hípica"
          : c.responsable === "propietario"
            ? " · se encarga el propietario"
            : " · esperando al propietario"
        : "";
    return {
      titulo: `${CUIDADOS[c.tipo] ?? c.tipo} · ${c.caballos?.nombre ?? "Caballo"}`,
      detalle: `${t.texto}${respuesta}`,
      href: `${base}/caballos/${c.caballo_id}`,
      tono: t.dias <= 1 ? "atencion" : "info",
      icono: "herradura",
      orden: t.dias <= 1 ? 6 : 10,
    };
  });
  alertas.push(...cuidadosAlertas);

  // Altas por revisar y almacén bajo mínimos.
  const [{ count: altas }, { data: almacen }] = await Promise.all([
    ctx.esAdmin
      ? supabase.from("altas").select("id", { count: "exact", head: true }).eq("hipica_id", hipica.id).eq("estado", "pendiente")
      : Promise.resolve({ count: 0 }),
    supabase
      .from("existencias")
      .select("nombre, unidad, cantidad, minimo, consumo_dia, pedido_en")
      .eq("hipica_id", hipica.id)
      .is("pedido_en", null)
      .returns<{ nombre: string; unidad: string; cantidad: number; minimo: number; consumo_dia: number | null }[]>(),
  ]);
  if (altas) {
    alertas.push({
      titulo: altas === 1 ? "1 alta por revisar" : `${altas} altas por revisar`,
      detalle: "Familias que se han apuntado desde la app",
      href: `${base}/gestion#altas`,
      tono: "atencion",
      icono: "personas",
      orden: 5,
    });
  }
  if (ctx.esAdmin) {
    const { data: sinCobrar } = await supabase
      .from("recibos")
      .select("estado, total, mes")
      .eq("hipica_id", hipica.id)
      .neq("estado", "pagado")
      .lt("mes", `${hoy.slice(0, 7)}-01`)
      .returns<{ estado: string; total: number; mes: string }[]>();
    const devueltos = (sinCobrar ?? []).filter((r) => r.estado === "devuelto");
    const pendientes = (sinCobrar ?? []).filter((r) => r.estado === "pendiente");
    const suma = (l: { total: number }[]) => l.reduce((n, r) => n + Number(r.total), 0).toLocaleString("es-ES");
    if (devueltos.length) {
      alertas.push({
        titulo: devueltos.length === 1 ? "1 recibo devuelto" : `${devueltos.length} recibos devueltos`,
        detalle: `${suma(devueltos)} € por cobrar`,
        href: `${base}/cobros?mes=${devueltos[0].mes.slice(0, 7)}&f=devuelto`,
        tono: "atencion",
        icono: "euro",
        orden: 2,
      });
    }
    if (pendientes.length) {
      alertas.push({
        titulo: pendientes.length === 1 ? "1 recibo sin pagar del mes pasado" : `${pendientes.length} recibos sin pagar de meses pasados`,
        detalle: `${suma(pendientes)} € pendientes`,
        href: `${base}/cobros?mes=${pendientes[0].mes.slice(0, 7)}&f=pendiente`,
        tono: "info",
        icono: "euro",
        orden: 9,
      });
    }
  }
  for (const e of (almacen ?? []).filter((x) => Number(x.cantidad) < Number(x.minimo))) {
    const dias = e.consumo_dia ? Math.floor(Number(e.cantidad) / Number(e.consumo_dia)) : null;
    alertas.push({
      titulo: `${e.nombre} bajo mínimos`,
      detalle: `Quedan ${Number(e.cantidad).toLocaleString("es-ES")} ${e.unidad}${dias !== null ? ` · unos ${dias} días` : ""}`,
      href: `${base}/cuadra#almacen`,
      tono: "atencion",
      icono: "saco",
      orden: 3,
    });
  }
  alertas.sort((a, b) => a.orden - b.orden);
  const nombreCaballo = new Map((caballos ?? []).map((c) => [c.id, c.nombre]));

  /* ---------- Clases de hoy, filtrables por pista ---------- */
  const pistas = [...new Set(deHoy.map((s) => s.pista).filter((p): p is string => !!p))];
  const filtro = pista && pistas.includes(pista) ? pista : null;
  const lista = filtro ? deHoy.filter((s) => s.pista === filtro) : deHoy;
  const activas = deHoy.filter((s) => !s.cancelada);
  const mensaje = textoAviso(aviso);

  return (
    <PantallaApp ancho="amplio"
      nav={navegacion(ctx, "inicio")}
      cabecera={
        <Cabecera campana={campana(ctx)} antetitulo={hipica.nombre} titulo={f.largo(ahora)} demo={ctx.demo}>
          <Cifras
            items={[
              { valor: activas.length, texto: activas.length === 1 ? "clase hoy" : "clases hoy" },
              { valor: activas.reduce((n, s) => n + s.ocupadas, 0), texto: "jinetes hoy" },
              { valor: alertas.length, texto: "por atender", href: "#atencion" },
            ]}
          />
        </Cabecera>
      }
    >
      {mensaje && <Aviso tipo="error">{mensaje}</Aviso>}
      {!ctx.demo && <InvitarAvisos />}

      <Columnas>
        <Columna>
      {alertas.length > 0 && (
        <Seccion titulo="Necesita atención" id="atencion">
          <div className={`${tarjeta} overflow-hidden`}>
            <ul className="divide-y divide-linea">{alertas.slice(0, 5).map(filaAlerta)}</ul>
            {alertas.length > 5 && (
              <details className="group border-t border-linea">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-center text-sm font-bold text-cuadra hover:bg-limo group-open:hidden">
                  Ver {alertas.length - 5} {alertas.length - 5 === 1 ? "aviso más" : "avisos más"}
                </summary>
                <ul className="divide-y divide-linea">{alertas.slice(5).map(filaAlerta)}</ul>
              </details>
            )}
          </div>
        </Seccion>
      )}

      {(solicitudes ?? []).length > 0 && (
        <Seccion
          titulo="Servicios por confirmar"
          id="solicitudes"
          accion={
            <Link href={`${base}/servicios`} className="text-sm font-bold text-cuadra hover:underline">
              Ver todos
            </Link>
          }
        >
          <ListaSolicitudes
            solicitudes={solicitudes ?? []}
            hipicaId={hipica.id}
            volver={base}
            modo="equipo"
            nombreCaballo={(id) => nombreCaballo.get(id) ?? null}
          />
        </Seccion>
      )}

        </Columna>
        <Columna>
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
              <FilaClase key={s.id} s={s} href={`${base}/sesion/${s.id}`} hora={f.hora(s.inicio)} fin={f.hora(s.fin)} ahora={ahora} />
            ))}
          </ul>
        )}
      </Seccion>

      <Tablon ctx={ctx} volver={base} />
        </Columna>
      </Columnas>
    </PantallaApp>
  );
}

function filaAlerta(a: Alerta, i: number) {
  return (
    <li key={i}>
      <Link href={a.href} className="flex items-center gap-3 px-4 py-3 hover:bg-limo">
        <span
          aria-hidden="true"
          className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
            a.tono === "atencion" ? "bg-atencion-suave text-atencion" : "bg-info-suave text-info"
          }`}
        >
          <Icono nombre={a.icono} className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold leading-snug">{a.titulo}</span>
          <span className="block text-sm text-tinta-suave">{a.detalle}</span>
        </span>
        <Icono nombre="flecha" className="size-5 shrink-0 text-tinta-suave" />
      </Link>
    </li>
  );
}

// Una clase en la lista del equipo: enlace a su lista de alumnos.
export function FilaClase({
  s,
  href,
  hora,
  fin,
  ahora,
  extra,
}: {
  s: SesionHorario;
  href: string;
  hora: string;
  fin?: string;
  ahora: Date;
  extra?: ReactNode;
}) {
  const terminada = new Date(s.fin) < ahora;
  const apagada = terminada || s.cancelada;
  return (
    <li className="flex gap-3">
      <Hora inicio={hora} fin={fin} apagada={apagada} />
      <Link href={href} className={`${tarjeta} block min-w-0 flex-1 p-4 transition-colors hover:border-tinta-suave/40`}>
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
          <div className="min-w-0 flex-1 basis-36">
            <p className={`font-extrabold ${s.cancelada ? "text-tinta-suave line-through" : apagada ? "text-tinta-suave" : ""}`}>
              {s.titulo}
            </p>
            <Meta
              className="mt-1"
              items={[
                { icono: "pista", texto: s.pista ?? "Sin pista" },
                { icono: "usuario", texto: s.monitor },
                { texto: s.tipo === "grupo" ? s.nivel : null },
              ]}
            />
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
