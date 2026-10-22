import { Suspense } from "react";
import Link from "next/link";
import {
  Aviso,
  Cabecera,
  CargandoApp,
  Chip,
  Cifras,
  Dias,
  Filtros,
  Hora,
  PantallaApp,
  Vacio,
  boton,
  botonSecundario,
  tarjeta,
} from "@/components/app/ui";
import { cargarContexto, fechas, navegacion, nombrePila, type Contexto } from "@/lib/hipica";
import { resumenBono, type EstadoBono, type SesionHorario } from "@/lib/tipos";
import { textoAviso } from "@/lib/avisos";
import { anular, apuntarseEspera, reservar, salirEspera } from "../actions";
import { FilaClase } from "../hoy";

const DIAS = 14;
const TIPOS = [
  { valor: "todas", texto: "Todas" },
  { valor: "grupo", texto: "Clases" },
  { valor: "libre", texto: "Pista libre" },
  { valor: "particular", texto: "Particulares" },
] as const;

export default function HorarioPage({ params, searchParams }: PageProps<"/hipica/[id]/horario">) {
  return (
    <Suspense fallback={<CargandoApp />}>
      <Contenido params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Contenido({ params, searchParams }: PageProps<"/hipica/[id]/horario">) {
  const { id } = await params;
  const q = await searchParams;
  const ctx = await cargarContexto(id);
  return <Horario ctx={ctx} dia={q.dia} tipo={q.tipo} para={q.para} aviso={q.aviso} />;
}

type Jinete = { id: string; nombre: string; yo: boolean };

async function Horario({
  ctx,
  dia,
  tipo,
  para,
  aviso,
}: {
  ctx: Contexto;
  dia?: string | string[];
  tipo?: string | string[];
  para?: string | string[];
  aviso?: string | string[];
}) {
  const { supabase, hipica, esStaff } = ctx;
  const f = fechas(hipica.zona_horaria);
  const ahora = new Date();
  const base = `/hipica/${hipica.id}`;

  const [{ data, error }, { data: estado }, { data: familia }] = await Promise.all([
    supabase.rpc("horario", {
      p_hipica: hipica.id,
      p_desde: new Date(ahora.getTime() - 16 * 36e5).toISOString(),
      p_hasta: new Date(ahora.getTime() + (DIAS + 1) * 864e5).toISOString(),
    }),
    esStaff ? Promise.resolve({ data: [] }) : supabase.rpc("estado_bonos", { p_hipica: hipica.id }),
    supabase
      .from("miembros")
      .select("id, nombre, user_id")
      .eq("hipica_id", hipica.id)
      .eq("activo", true)
      .or(`id.eq.${ctx.yo.id},titular_id.eq.${ctx.yo.id}`)
      .order("nombre")
      .returns<{ id: string; nombre: string; user_id: string | null }[]>(),
  ]);
  if (error) throw new Error(error.message);

  const todas = ((data ?? []) as SesionHorario[]).filter((s) => esStaff || new Date(s.inicio) > ahora);
  const hoy = f.clave(ahora);

  // Días: hoy y los 13 siguientes.
  const claves: { clave: string; fecha: Date }[] = [];
  for (let i = 0; claves.length < DIAS && i < DIAS + 2; i++) {
    const fecha = new Date(ahora.getTime() + i * 864e5);
    const clave = f.clave(fecha);
    if (!claves.some((c) => c.clave === clave)) claves.push({ clave, fecha });
  }
  // Sin día elegido: hoy, o el primer día que tenga clases por delante.
  const primero =
    claves.find(({ clave }) => todas.some((s) => f.clave(s.inicio) === clave && new Date(s.fin) > ahora))?.clave ?? hoy;
  const elegido = typeof dia === "string" && claves.some((c) => c.clave === dia) ? dia : primero;
  /* ---------- Para familias: quién reserva y cómo va su bono ---------- */
  const jinetes: Jinete[] = (familia ?? [])
    .map((m) => ({ id: m.id, nombre: m.nombre, yo: m.user_id === ctx.userId }))
    .sort((a, b) => Number(a.yo) - Number(b.yo));
  const esFamilia = jinetes.length > 1;
  // En una familia se reserva para una persona cada vez (por defecto, el primer hijo).
  const elegida = jinetes.find((j) => j.id === para) ?? jinetes[0];
  const filtro = TIPOS.find((t) => t.valor === tipo)?.valor ?? "todas";
  const url = (d: string, t: string, quien: string | undefined = elegida?.id) => {
    const p = new URLSearchParams();
    if (d !== primero) p.set("dia", d);
    if (t !== "todas") p.set("tipo", t);
    if (esFamilia && quien && quien !== jinetes[0]?.id) p.set("para", quien);
    const s = p.toString();
    return `${base}/horario${s ? `?${s}` : ""}`;
  };
  const delDia = todas.filter((s) => f.clave(s.inicio) === elegido && (filtro === "todas" || s.tipo === filtro));
  const volver = url(elegido, filtro);
  const tiposPresentes = new Set(todas.map((s) => s.tipo));
  const mensaje = textoAviso(aviso);
  const fechaElegida = claves.find((c) => c.clave === elegido)?.fecha ?? ahora;

  /* ---------- Cabecera ---------- */
  let cabecera;
  if (esStaff) {
    const semana = todas.filter((s) => !s.cancelada && new Date(s.inicio).getTime() < ahora.getTime() + 7 * 864e5);
    const plazas = semana.reduce((n, s) => n + s.plazas, 0);
    const ocupadas = semana.reduce((n, s) => n + Math.min(s.ocupadas, s.plazas), 0);
    cabecera = (
      <Cabecera antetitulo="Próximos 7 días" titulo="Clases" demo={ctx.demo}>
        <Cifras
          items={[
            { valor: semana.length, texto: "clases" },
            { valor: plazas ? `${Math.round((ocupadas / plazas) * 100)}%` : "–", texto: "ocupación" },
            { valor: semana.reduce((n, s) => n + s.en_espera, 0), texto: "en espera" },
          ]}
        />
      </Cabecera>
    );
  } else {
    cabecera = <Cabecera antetitulo={hipica.nombre} titulo="Reservar" demo={ctx.demo} />;
  }

  /* ---------- Para el equipo: caballos que faltan ---------- */
  let faltan = new Map<string, number>();
  const conCaballo = delDia.filter((s) => s.tipo !== "libre").map((s) => s.id);
  if (esStaff && conCaballo.length) {
    const { data: res } = await supabase
      .from("reservas")
      .select("sesion_id, caballo_id")
      .in("sesion_id", conCaballo)
      .eq("estado", "confirmada")
      .is("caballo_id", null)
      .returns<{ sesion_id: string }[]>();
    faltan = (res ?? []).reduce((m, r) => m.set(r.sesion_id, (m.get(r.sesion_id) ?? 0) + 1), new Map<string, number>());
  }

  const bonos = new Map(((estado ?? []) as EstadoBono[]).map((b) => [b.miembro_id, b]));
  const sinClases = (miembroId: string) => {
    const b = bonos.get(miembroId);
    return hipica.exigir_bono && (!b || resumenBono(b, hoy).quedan <= 0);
  };
  const conBono = jinetes.filter((j) => bonos.get(j.id)?.bono_id);

  return (
    <PantallaApp nav={navegacion(ctx, "horario")} cabecera={cabecera}>
      <div className="space-y-4">
        {mensaje && <Aviso tipo="error">{mensaje}</Aviso>}

        {!esStaff && conBono.length > 0 && (
          <div className={`${tarjeta} flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3`}>
            <span className="text-sm font-bold">Bonos</span>
            {conBono.map((j) => {
              const r = resumenBono(bonos.get(j.id)!, hoy);
              return (
                <span key={j.id} className="inline-flex items-center gap-1.5 text-sm">
                  {esFamilia && <span className="font-semibold">{j.yo ? "Tú" : nombrePila(j.nombre)}</span>}
                  <Chip tono={r.tono}>{r.texto}</Chip>
                </span>
              );
            })}
          </div>
        )}

        {esFamilia && (
          <div className="space-y-2">
            <p className="text-sm font-bold">¿Para quién reservas?</p>
            <Filtros
              opciones={jinetes.map((j) => ({
                texto: j.yo ? "Para mí" : nombrePila(j.nombre),
                href: url(elegido, filtro, j.id),
                activo: j.id === elegida?.id,
              }))}
            />
          </div>
        )}

        <Dias
          dias={claves.map(({ clave, fecha }) => ({
            clave,
            corto: clave === hoy ? "Hoy" : f.corto(fecha),
            numero: f.numero(fecha),
            href: url(clave, filtro),
            activo: clave === elegido,
            marca: !esStaff && todas.some((s) => f.clave(s.inicio) === clave && s.mias.length > 0 && !s.cancelada),
          }))}
        />

        {tiposPresentes.size > 1 && (
          <Filtros
            opciones={TIPOS.filter((t) => t.valor === "todas" || tiposPresentes.has(t.valor)).map((t) => ({
              texto: t.texto,
              href: url(elegido, t.valor),
              activo: filtro === t.valor,
            }))}
          />
        )}
      </div>

      <h2 className="mb-3 mt-6 text-lg font-extrabold first-letter:uppercase">{f.largo(fechaElegida)}</h2>

      {delDia.length === 0 ? (
        <Vacio>{filtro === "todas" ? "No hay clases este día." : "No hay nada de este tipo este día."}</Vacio>
      ) : esStaff ? (
        <ul className="space-y-2.5">
          {delDia.map((s) => (
            <FilaClase
              key={s.id}
              s={s}
              href={`${base}/sesion/${s.id}`}
              hora={f.hora(s.inicio)}
              ahora={ahora}
              extra={
                faltan.get(s.id) && !s.cancelada && new Date(s.fin) > ahora ? (
                  <p className="mt-3">
                    <Chip tono="atencion">
                      {faltan.get(s.id) === 1 ? "Falta 1 caballo por asignar" : `Faltan ${faltan.get(s.id)} caballos por asignar`}
                    </Chip>
                  </p>
                ) : null
              }
            />
          ))}
        </ul>
      ) : (
        <ul className="space-y-2.5">
          {delDia.map((s) => (
            <ClaseAlumno
              key={s.id}
              s={s}
              hora={f.hora(s.inicio)}
              jinetes={elegida ? [elegida] : []}
              familia={esFamilia}
              hipicaId={hipica.id}
              volver={volver}
              limite={hipica.horas_minimas_anulacion}
              sinClases={sinClases}
              ahora={ahora}
            />
          ))}
        </ul>
      )}

      {ctx.esAdmin && (
        <Link href={`${base}/clases`} className={`${botonSecundario} mt-6 w-full`}>
          Horario semanal y nuevas clases
        </Link>
      )}
      {!esStaff && (
        <p className="mt-6 text-sm text-tinta-suave">
          Puedes anular hasta {hipica.horas_minimas_anulacion} horas antes. Si una clase está completa, apúntate a la lista
          de espera: si alguien anula, entras tú y lo verás en Inicio.
        </p>
      )}
    </PantallaApp>
  );
}

const botonFamilia =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-cuadra/60 bg-white px-4 py-2.5 font-bold text-cuadra transition-colors hover:bg-alfalfa-suave";

function ClaseAlumno({
  s,
  hora,
  jinetes,
  familia,
  hipicaId,
  volver,
  limite,
  sinClases,
  ahora,
}: {
  s: SesionHorario;
  hora: string;
  jinetes: Jinete[];
  familia: boolean;
  hipicaId: string;
  volver: string;
  limite: number;
  sinClases: (miembroId: string) => boolean;
  ahora: Date;
}) {
  const libres = Math.max(s.plazas - s.ocupadas, 0);
  const anulable = new Date(s.inicio).getTime() - limite * 36e5 > ahora.getTime();
  const mias = s.mias.length > 0;
  const para = (j: Jinete) => (familia ? (j.yo ? " para mí" : ` para ${nombrePila(j.nombre)}`) : "");
  const ocultos = (extra: Record<string, string>) => (
    <>
      <input type="hidden" name="hipica_id" value={hipicaId} />
      <input type="hidden" name="volver" value={volver} />
      {Object.entries(extra).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
    </>
  );

  let estado;
  if (s.cancelada) estado = <Chip tono="alerta">Cancelada</Chip>;
  else if (mias) estado = <Chip tono="ok">{familia ? `Plaza: ${s.mias.map((m) => nombrePila(m.nombre)).join(", ")}` : "Tienes plaza"}</Chip>;
  else if (libres === 0) estado = <Chip tono="atencion">{s.tipo === "particular" ? "Reservada" : "Completa"}</Chip>;
  else if (s.tipo === "particular") estado = <Chip>Libre</Chip>;
  else estado = <Chip tono={libres <= 1 ? "atencion" : "neutro"}>{libres === 1 ? "1 plaza libre" : `${libres} plazas libres`}</Chip>;

  return (
    <li className="flex gap-3">
      <Hora inicio={hora} apagada={s.cancelada} />
      <div className={`${tarjeta} min-w-0 flex-1 p-4 ${mias && !s.cancelada ? "ring-2 ring-alfalfa" : ""}`}>
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
          <div className="min-w-0 flex-1 basis-36">
            <p className={`font-extrabold ${s.cancelada ? "text-tinta-suave line-through" : ""}`}>{s.titulo}</p>
            <p className="text-sm text-tinta-suave">
              {[s.pista, s.monitor && `con ${nombrePila(s.monitor)}`, s.nivel].filter(Boolean).join(" · ")}
            </p>
          </div>
          {estado}
        </div>

        {s.mias.some((m) => m.caballo) && (
          <p className="mt-2 text-sm">
            {s.mias
              .filter((m) => m.caballo)
              .map((m) => (familia ? `${nombrePila(m.nombre)} monta a ${m.caballo}` : `Montas a ${m.caballo}`))
              .join(" · ")}
          </p>
        )}
        {s.tipo === "libre" && <p className="mt-2 text-sm text-tinta-suave">No gasta clases del bono.</p>}

        {!s.cancelada && (
          <div className={`mt-3 grid gap-2 ${familia ? "" : "sm:flex sm:justify-end"}`}>
            {jinetes.map((j) => {
              const suya = s.mias.find((m) => m.miembro === j.id);
              const espera = s.esperas.find((e) => e.miembro === j.id);
              if (suya) {
                return anulable ? (
                  <form key={j.id} action={anular}>
                    {ocultos({ reserva_id: suya.reserva })}
                    <button type="submit" className={`${botonSecundario} w-full text-tinta-suave`}>
                      Anular{familia ? (j.yo ? " la mía" : ` la de ${nombrePila(j.nombre)}`) : " reserva"}
                    </button>
                  </form>
                ) : (
                  <p key={j.id} className="text-sm text-tinta-suave">
                    {familia ? `${nombrePila(j.nombre)}: ` : ""}ya no se puede anular desde la app.
                  </p>
                );
              }
              if (espera) {
                return (
                  <form key={j.id} action={salirEspera}>
                    {ocultos({ espera_id: espera.espera })}
                    <button type="submit" className={`${botonSecundario} w-full`}>
                      {familia ? `${nombrePila(j.nombre)}: ` : ""}en espera (puesto {espera.puesto}) · Salir
                    </button>
                  </form>
                );
              }
              if (s.tipo === "grupo" && sinClases(j.id)) {
                return (
                  <p key={j.id} className="text-sm text-tinta-suave">
                    {familia ? `${nombrePila(j.nombre)}: ` : ""}sin clases en el bono. Pide uno en la hípica.
                  </p>
                );
              }
              if (libres > 0) {
                return (
                  <form key={j.id} action={reservar}>
                    {ocultos({ sesion_id: s.id, miembro_id: j.id })}
                    <button type="submit" className={`${familia ? botonFamilia : boton} w-full sm:min-w-36`}>
                      Reservar{para(j)}
                    </button>
                  </form>
                );
              }
              if (s.tipo === "particular") return null;
              return (
                <form key={j.id} action={apuntarseEspera}>
                  {ocultos({ sesion_id: s.id, miembro_id: j.id })}
                  <button type="submit" className={`${botonSecundario} w-full`}>
                    Lista de espera{para(j)}
                  </button>
                </form>
              );
            })}
          </div>
        )}
      </div>
    </li>
  );
}
