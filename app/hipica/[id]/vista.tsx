import Link from "next/link";
import { Aviso, Cabecera, Hora, Plazas, Vacio, boton, botonSecundario } from "@/components/app/ui";
import { anular, reservar } from "./actions";

export type Sesion = {
  id: string;
  titulo: string;
  nivel: string | null;
  inicio: string;
  fin: string;
  plazas: number;
  ocupadas: number;
  cancelada: boolean;
  monitor: string | null;
  mias: { reserva: string; miembro: string; nombre: string }[];
};

// Personas para las que el usuario puede reservar: él mismo y sus jinetes a cargo.
export type Jinete = { id: string; nombre: string; yo: boolean };

export const DIAS_VISTA = 14;

const botonFamilia =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-cuadra/60 bg-white px-4 py-2.5 font-semibold text-cuadra transition-colors hover:bg-alfalfa-suave";

const AVISOS: Record<string, string> = {
  completa: "No quedan plazas en esa clase.",
  repetida: "Ya tienes plaza en esa clase.",
  cancelada: "Esa clase está cancelada.",
  empezada: "Esa clase ya ha empezado.",
  plazo: "Ya no se puede anular: ha pasado el plazo.",
  ajena: "No puedes anular esa reserva.",
  persona: "No puedes reservar para esa persona.",
  error: "Algo ha fallado. Vuelve a intentarlo.",
};

type Props = {
  id: string;
  hipica: { nombre: string; zona_horaria: string; horas_minimas_anulacion: number };
  rol: string;
  sesiones: Sesion[];
  jinetes: Jinete[];
  aviso?: string;
  ahora: Date;
};

const unir = (nombres: string[]) =>
  nombres.length <= 1 ? (nombres[0] ?? "") : `${nombres.slice(0, -1).join(", ")} y ${nombres.at(-1)}`;

// La parte visual del horario, separada de la carga de datos.
export function HorarioVista({ id, hipica, rol, sesiones, jinetes, aviso, ahora }: Props) {
  const esStaff = rol === "admin" || rol === "monitor";
  const familia = jinetes.length > 1;
  const tz = hipica.zona_horaria;
  const fClave = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  const fDia = new Intl.DateTimeFormat("es-ES", { timeZone: tz, weekday: "long", day: "numeric", month: "long" });
  const fHora = new Intl.DateTimeFormat("es-ES", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
  const hoy = fClave.format(ahora);
  const manana = fClave.format(new Date(ahora.getTime() + 864e5));

  const nombreDia = (fecha: Date) => {
    const clave = fClave.format(fecha);
    const largo = fDia.format(fecha);
    if (clave === hoy) return { titulo: "Hoy", detalle: largo };
    if (clave === manana) return { titulo: "Mañana", detalle: largo };
    return { titulo: largo.charAt(0).toUpperCase() + largo.slice(1), detalle: null };
  };

  // Los alumnos solo ven clases futuras; el equipo también las de hoy ya empezadas.
  const visibles = sesiones.filter((s) => esStaff || new Date(s.inicio) > ahora);
  const dias = new Map<string, Sesion[]>();
  for (const s of visibles) {
    const clave = fClave.format(new Date(s.inicio));
    dias.set(clave, [...(dias.get(clave) ?? []), s]);
  }

  const proxima = visibles.find((s) => s.mias.length > 0 && !s.cancelada && new Date(s.inicio) > ahora);

  return (
    <div className="mt-4 space-y-8">
      <Cabecera
        titulo={hipica.nombre}
        detalle={`Puedes anular hasta ${hipica.horas_minimas_anulacion} horas antes de la clase.`}
        accion={
          <Link href={`/hipica/${id}/familia`} className={botonSecundario}>
            {familia ? "Mi familia" : "Añadir a un hijo"}
          </Link>
        }
      />

      {aviso && Object.hasOwn(AVISOS, aviso) && <Aviso tipo="error">{AVISOS[aviso]}</Aviso>}

      {proxima && (
        <div className="flex items-center gap-4 rounded-xl bg-cuadra px-5 py-4 text-white">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-white/75">
              {familia ? `Próxima clase de ${unir(proxima.mias.map((m) => m.nombre))}` : "Tu próxima clase"}
            </p>
            <p className="truncate text-lg font-semibold">
              {proxima.titulo}, {nombreDia(new Date(proxima.inicio)).titulo.toLowerCase()} a las{" "}
              {fHora.format(new Date(proxima.inicio))}
            </p>
          </div>
        </div>
      )}

      {dias.size === 0 && (
        <Vacio>
          No hay clases publicadas para los próximos {DIAS_VISTA} días.
          {rol === "admin" && (
            <>
              {" "}
              <Link href={`/hipica/${id}/clases`} className="font-semibold text-cuadra underline">
                Publica el calendario
              </Link>
              .
            </>
          )}
        </Vacio>
      )}

      {[...dias.entries()].map(([clave, lista]) => {
        const dia = nombreDia(new Date(lista[0].inicio));
        return (
          <section key={clave} aria-labelledby={`dia-${clave}`}>
            <div className="sticky top-0 z-10 -mx-4 bg-limo/95 px-4 py-2 backdrop-blur">
              <h2 id={`dia-${clave}`} className="text-lg font-bold [font-stretch:85%]">
                {dia.titulo}
                {dia.detalle && <span className="ml-2 font-normal text-tinta-suave">{dia.detalle}</span>}
              </h2>
            </div>

            <ul className="mt-1 overflow-hidden rounded-xl border border-linea bg-white">
              {lista.map((s) => {
                const libres = Math.max(s.plazas - s.ocupadas, 0);
                const empezada = new Date(s.inicio) <= ahora;
                const apagada = s.cancelada || empezada;
                return (
                  <li
                    key={s.id}
                    className={`flex flex-wrap items-start gap-x-4 gap-y-3 border-t border-linea px-4 py-4 first:border-t-0 ${
                      s.mias.length > 0 && !apagada ? "bg-alfalfa-suave" : ""
                    }`}
                  >
                    <Hora inicio={fHora.format(new Date(s.inicio))} fin={fHora.format(new Date(s.fin))} apagada={apagada} />

                    <div className="min-w-0 flex-1 basis-40 space-y-2 pt-0.5">
                      <div>
                        <p className={`text-lg font-semibold leading-tight ${s.cancelada ? "text-tinta-suave line-through" : ""}`}>
                          {s.titulo}
                        </p>
                        {(s.nivel || s.monitor) && (
                          <p className="text-sm text-tinta-suave">
                            {[s.nivel, s.monitor && `con ${s.monitor}`].filter(Boolean).join(", ")}
                          </p>
                        )}
                      </div>
                      {s.cancelada ? (
                        <p className="text-sm font-semibold text-alerta">Clase cancelada</p>
                      ) : empezada ? (
                        <p className="text-sm text-tinta-suave">
                          En curso o terminada, {s.ocupadas} {s.ocupadas === 1 ? "alumno" : "alumnos"}
                        </p>
                      ) : (
                        <Plazas
                          plazas={s.plazas}
                          ocupadas={s.ocupadas}
                          mias={s.mias.length}
                          etiquetaMia={familia ? `Plaza para ${unir(s.mias.map((m) => m.nombre))}` : "Tienes plaza"}
                        />
                      )}
                    </div>

                    <div className={`flex w-full gap-2 ${familia ? "flex-col sm:w-60" : "sm:w-auto sm:flex-col sm:items-stretch"}`}>
                      {!apagada &&
                        jinetes.map((j) => {
                          const suya = s.mias.find((m) => m.miembro === j.id);
                          const nombre = j.yo ? "mí" : j.nombre;
                          if (suya) {
                            return (
                              <form key={j.id} action={anular} className="flex-1">
                                <input type="hidden" name="hipica_id" value={id} />
                                <input type="hidden" name="reserva_id" value={suya.reserva} />
                                <button type="submit" className={`${botonSecundario} w-full ${familia ? "text-tinta-suave" : ""}`}>
                                  {familia ? (j.yo ? "Anular la mía" : `Anular la de ${j.nombre}`) : "Anular"}
                                </button>
                              </form>
                            );
                          }
                          if (libres === 0) return null;
                          return (
                            <form key={j.id} action={reservar} className="flex-1">
                              <input type="hidden" name="hipica_id" value={id} />
                              <input type="hidden" name="sesion_id" value={s.id} />
                              <input type="hidden" name="miembro_id" value={j.id} />
                              <button
                                type="submit"
                                className={`${familia ? botonFamilia : boton} w-full`}
                              >
                                {familia ? `Reservar para ${nombre}` : "Reservar"}
                              </button>
                            </form>
                          );
                        })}
                      {esStaff && (
                        <Link href={`/hipica/${id}/sesion/${s.id}`} className={`${botonSecundario} flex-1`}>
                          Lista de {s.ocupadas}
                        </Link>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
