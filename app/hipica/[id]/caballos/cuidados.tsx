import { Chip, botonSecundario, botonTexto, boton, tarjeta } from "@/components/app/ui";
import { CUIDADOS, cuandoToca } from "@/lib/hipica";
import { borrarCuidado, cuidadoHecho, responderCuidado } from "./actions";

export type Cuidado = {
  id: string;
  caballo_id: string;
  tipo: string;
  fecha: string;
  nota: string | null;
  responsable: "hipica" | "propietario" | null;
};

// Lista de próximos cuidados. El equipo los marca como hechos; el
// propietario dice quién se encarga.
export function ListaCuidados({
  cuidados,
  hoy,
  hipicaId,
  volver,
  modo,
  nombreCaballo,
  esPropietario,
}: {
  cuidados: Cuidado[];
  hoy: string;
  hipicaId: string;
  volver: string;
  modo: "equipo" | "propietario";
  nombreCaballo?: (caballoId: string) => string | null;
  esPropietario?: (caballoId: string) => boolean;
}) {
  const ocultos = (c: Cuidado) => (
    <>
      <input type="hidden" name="hipica_id" value={hipicaId} />
      <input type="hidden" name="cuidado_id" value={c.id} />
      <input type="hidden" name="volver" value={volver} />
    </>
  );
  return (
    <ul className={`${tarjeta} divide-y divide-linea overflow-hidden`}>
      {cuidados.map((c) => {
        const t = cuandoToca(c.fecha, hoy);
        const caballo = nombreCaballo?.(c.caballo_id);
        const deUnPropietario = esPropietario?.(c.caballo_id) ?? false;
        return (
          <li key={c.id} className="space-y-2 px-4 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold">
                  {CUIDADOS[c.tipo] ?? c.tipo}
                  {caballo && <span className="font-semibold"> · {caballo}</span>}
                </p>
                <p className="text-sm text-tinta-suave">
                  {new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(c.fecha))}
                  {c.nota && ` · ${c.nota}`}
                </p>
              </div>
              <Chip tono={t.tono}>{t.texto}</Chip>
            </div>

            {c.responsable && (
              <p className="text-sm">
                {c.responsable === "hipica"
                  ? modo === "propietario"
                    ? "Se encarga la hípica."
                    : "El propietario quiere que se encargue la hípica."
                  : modo === "propietario"
                    ? "Te encargas tú (por ejemplo, con tu veterinario)."
                    : "Se encarga el propietario."}
              </p>
            )}
            {!c.responsable && modo === "equipo" && deUnPropietario && t.dias <= 14 && (
              <p className="text-sm text-tinta-suave">Esperando respuesta del propietario.</p>
            )}

            {modo === "propietario" && (
              <form action={responderCuidado} className="flex flex-wrap gap-2">
                {ocultos(c)}
                <button
                  type="submit"
                  name="responsable"
                  value="hipica"
                  aria-pressed={c.responsable === "hipica"}
                  className={`${c.responsable === "hipica" ? boton : botonSecundario} flex-1 px-3 text-sm`}
                >
                  Que lo haga la hípica
                </button>
                <button
                  type="submit"
                  name="responsable"
                  value="propietario"
                  aria-pressed={c.responsable === "propietario"}
                  className={`${c.responsable === "propietario" ? boton : botonSecundario} flex-1 px-3 text-sm`}
                >
                  Me encargo yo
                </button>
              </form>
            )}

            {modo === "equipo" && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <form action={cuidadoHecho} className="flex min-w-0 flex-1 gap-2">
                  {ocultos(c)}
                  <label htmlFor={`nota-${c.id}`} className="sr-only">
                    Nota (opcional)
                  </label>
                  <input
                    id={`nota-${c.id}`}
                    name="nota"
                    maxLength={300}
                    placeholder="Nota (opcional)"
                    className="min-w-0 flex-1 rounded-xl border border-linea bg-white px-3 py-2 text-sm outline-none focus:border-cuadra"
                  />
                  <button type="submit" className={`${botonSecundario} shrink-0 px-3 text-sm`}>
                    Hecho
                  </button>
                </form>
                <form action={borrarCuidado}>
                  {ocultos(c)}
                  <button type="submit" className={`${botonTexto} hover:text-alerta`} aria-label={`Borrar ${CUIDADOS[c.tipo] ?? c.tipo}`}>
                    Borrar
                  </button>
                </form>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
