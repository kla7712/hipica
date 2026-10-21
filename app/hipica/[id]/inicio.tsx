import Link from "next/link";
import {
  Aviso,
  Cabecera,
  CasillaFecha,
  Chip,
  PantallaApp,
  Seccion,
  Vacio,
  boton,
  botonSecundario,
  tarjeta,
} from "@/components/app/ui";
import { fechas, navegacion, nombrePila, unir, type Contexto } from "@/lib/hipica";
import { resumenBono, type EstadoBono, type SesionHorario } from "@/lib/tipos";
import { textoAviso } from "@/lib/avisos";
import { anular, salirEspera } from "./actions";
import { Tablon } from "./tablon";

const DIAS = 14;

// Pantalla de inicio de alumnos y familias.
export async function Inicio({ ctx, aviso }: { ctx: Contexto; aviso?: string | string[] }) {
  const { supabase, hipica } = ctx;
  const f = fechas(hipica.zona_horaria);
  const ahora = new Date();
  const base = `/hipica/${hipica.id}`;

  const [{ data: horario, error }, { data: estado }] = await Promise.all([
    supabase.rpc("horario", {
      p_hipica: hipica.id,
      p_desde: ahora.toISOString(),
      p_hasta: new Date(ahora.getTime() + DIAS * 864e5).toISOString(),
    }),
    supabase.rpc("estado_bonos", { p_hipica: hipica.id }),
  ]);
  if (error) throw new Error(error.message);
  const sesiones = (horario ?? []) as SesionHorario[];
  const bonos = (estado ?? []) as EstadoBono[];

  // ¿Familia? (titular con jinetes a su cargo)
  const hijos = bonos.filter((b) => b.titular_id === ctx.yo.id);
  const familia = hijos.length > 0;
  const yoBono = bonos.find((b) => b.miembro_id === ctx.yo.id);
  const conBono = [...hijos, ...(yoBono && (!familia || yoBono.bono_id) ? [yoBono] : [])];
  const hoy = f.clave(ahora);

  // Mis próximas clases (y listas de espera), una fila por jinete.
  type Fila =
    | { tipo: "reserva"; s: SesionHorario; id: string; nombre: string; caballo: string | null; desdeEspera: boolean }
    | { tipo: "espera"; s: SesionHorario; id: string; nombre: string; puesto: number };
  const filas: Fila[] = sesiones
    .flatMap((s): Fila[] => [
      ...s.mias.map((m) => ({
        tipo: "reserva" as const,
        s,
        id: m.reserva,
        nombre: m.nombre,
        caballo: m.caballo,
        desdeEspera: m.desde_espera,
      })),
      ...s.esperas.map((e) => ({ tipo: "espera" as const, s, id: e.espera, nombre: e.nombre, puesto: e.puesto })),
    ])
    .slice(0, 10);

  const entraron = filas.filter((x) => x.tipo === "reserva" && x.desdeEspera && !x.s.cancelada);
  const mensaje = textoAviso(aviso);
  const limite = hipica.horas_minimas_anulacion * 36e5;
  const quien = (nombre: string) => (nombre === ctx.yo.nombre ? (familia ? `${nombrePila(nombre)} (tú)` : null) : nombrePila(nombre));

  return (
    <PantallaApp
      nav={navegacion(hipica.id, ctx.yo.rol, "inicio")}
      cabecera={<Cabecera antetitulo={hipica.nombre} titulo={`Hola, ${nombrePila(ctx.yo.nombre)}`} demo={ctx.demo} />}
    >
      <div className="space-y-3">
        {mensaje && <Aviso tipo="error">{mensaje}</Aviso>}
        {entraron.length > 0 && (
          <Aviso tipo="ok">
            ¡Hay sitio! {unir(entraron.map((e) => nombrePila(e.nombre)))}{" "}
            {entraron.length === 1 ? "ha entrado" : "han entrado"} desde la lista de espera. Lo tienes abajo.
          </Aviso>
        )}
        {ctx.demo && (
          <Aviso tipo="info">
            Estás en la demo como una madre con dos hijos. Reserva, anula o apúntate a una lista de espera: todo vuelve a
            su estado original cada noche.
          </Aviso>
        )}
      </div>

      {conBono.length > 0 && (
        <Seccion titulo={familia ? "Bonos de clases" : "Tu bono"} id="bonos">
          <ul className={`${tarjeta} divide-y divide-linea overflow-hidden`}>
            {conBono.map((b) => {
              const r = resumenBono(b, hoy);
              return (
                <li key={b.miembro_id} className="flex items-center justify-between gap-3 px-4 py-3.5">
                  <div className="min-w-0">
                    <p className="font-bold">
                      {b.miembro_id === ctx.yo.id ? (familia ? `${nombrePila(b.nombre)} (tú)` : "Tú") : nombrePila(b.nombre)}
                      {b.nivel && <span className="font-semibold text-tinta-suave"> · {b.nivel}</span>}
                    </p>
                    {r.renovar && <p className="text-sm text-tinta-suave">Pide uno nuevo en la hípica.</p>}
                  </div>
                  <Chip tono={r.tono}>{r.texto}</Chip>
                </li>
              );
            })}
          </ul>
        </Seccion>
      )}

      <Seccion titulo={familia ? "Próximas clases" : "Tus próximas clases"} id="proximas">
        {filas.length === 0 ? (
          <Vacio>No tienes clases reservadas en los próximos {DIAS} días.</Vacio>
        ) : (
          <ul className={`${tarjeta} divide-y divide-linea overflow-hidden`}>
            {filas.map((x) => {
              const nombre = quien(x.nombre);
              const puedeAnular = new Date(x.s.inicio).getTime() - limite > ahora.getTime();
              const detalle = [
                f.hora(x.s.inicio),
                x.s.pista,
                x.s.monitor && `con ${nombrePila(x.s.monitor)}`,
                x.tipo === "reserva" && x.caballo && `caballo: ${x.caballo}`,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={x.id} className="flex items-center gap-3 px-4 py-3.5">
                  <CasillaFecha corto={f.clave(x.s.inicio) === hoy ? "Hoy" : f.corto(x.s.inicio)} numero={f.numero(x.s.inicio)} />
                  <div className="min-w-0 flex-1">
                    <p className={`font-bold ${x.s.cancelada ? "text-tinta-suave line-through" : ""}`}>
                      {x.s.titulo}
                      {nombre && <span className="font-semibold"> · {nombre}</span>}
                    </p>
                    <p className="text-sm text-tinta-suave">{detalle}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5 empty:hidden">
                      {x.s.cancelada && <Chip tono="alerta">Cancelada por la hípica</Chip>}
                      {x.tipo === "espera" && <Chip tono="info">En espera · puesto {x.puesto}</Chip>}
                      {x.tipo === "reserva" && x.desdeEspera && !x.s.cancelada && <Chip tono="ok">Entró desde la espera</Chip>}
                    </div>
                  </div>
                  {x.tipo === "reserva" && !x.s.cancelada && puedeAnular && (
                    <form action={anular}>
                      <input type="hidden" name="hipica_id" value={hipica.id} />
                      <input type="hidden" name="reserva_id" value={x.id} />
                      <input type="hidden" name="volver" value={base} />
                      <button
                        type="submit"
                        className={`${botonSecundario} px-3 text-sm`}
                        aria-label={`Anular ${x.s.titulo} de ${nombrePila(x.nombre)}`}
                      >
                        Anular
                      </button>
                    </form>
                  )}
                  {x.tipo === "espera" && (
                    <form action={salirEspera}>
                      <input type="hidden" name="hipica_id" value={hipica.id} />
                      <input type="hidden" name="espera_id" value={x.id} />
                      <input type="hidden" name="volver" value={base} />
                      <button
                        type="submit"
                        className={`${botonSecundario} px-3 text-sm`}
                        aria-label={`Salir de la lista de espera de ${x.s.titulo}`}
                      >
                        Salir
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 text-sm text-tinta-suave">
          Puedes anular hasta {hipica.horas_minimas_anulacion} horas antes de la clase.
        </p>
        <Link href={`${base}/horario`} className={`${boton} mt-4 w-full`}>
          Reservar clase
        </Link>
      </Seccion>

      <Tablon ctx={ctx} volver={base} />
    </PantallaApp>
  );
}
