import { Chip, boton, botonSecundario, botonTexto, tarjeta } from "@/components/app/ui";
import { euros } from "@/lib/hipica";
import { responderSolicitud } from "./actions";

export type Solicitud = {
  id: string;
  caballo_id: string;
  fecha: string;
  servicios: { id: string; nombre: string; precio: number | null }[];
  total: number;
  nota: string | null;
  estado: "pendiente" | "aceptada" | "rechazada" | "hecha";
  created_at: string;
};

const ESTADOS = {
  pendiente: { texto: "Pendiente", tono: "info" },
  aceptada: { texto: "Aceptada", tono: "ok" },
  rechazada: { texto: "Rechazada", tono: "alerta" },
  hecha: { texto: "Hecha", tono: "neutro" },
} as const;

const fFecha = new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

// Lista de solicitudes de servicios. El equipo responde; el propietario
// puede retirar las que siguen pendientes.
export function ListaSolicitudes({
  solicitudes,
  hipicaId,
  volver,
  modo,
  puedeAceptar = true,
  nombreCaballo,
}: {
  solicitudes: Solicitud[];
  hipicaId: string;
  volver: string;
  modo: "equipo" | "propietario";
  puedeAceptar?: boolean;
  nombreCaballo?: (caballoId: string) => string | null;
}) {
  return (
    <ul className="space-y-2.5">
      {solicitudes.map((s) => {
        const e = ESTADOS[s.estado];
        const tarifa = s.servicios.some((x) => x.precio === null);
        const boton1 = (estado: string, texto: string, principal = false) => (
          <form action={responderSolicitud} className="flex-1">
            <input type="hidden" name="hipica_id" value={hipicaId} />
            <input type="hidden" name="solicitud_id" value={s.id} />
            <input type="hidden" name="estado" value={estado} />
            <input type="hidden" name="volver" value={volver} />
            <button type="submit" className={`${principal ? boton : botonSecundario} w-full px-3 text-sm`}>
              {texto}
            </button>
          </form>
        );
        return (
          <li key={s.id} className={`${tarjeta} space-y-2 p-4`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold">
                  {s.servicios.map((x) => x.nombre).join(", ")}
                  {nombreCaballo?.(s.caballo_id) && <span className="font-semibold"> · {nombreCaballo(s.caballo_id)}</span>}
                </p>
                <p className="text-sm text-tinta-suave first-letter:uppercase">
                  {fFecha.format(new Date(s.fecha)).replace(".", "")}
                  {" · "}
                  {Number(s.total) > 0 ? euros(s.total) : tarifa ? "Según tarifa" : "Incluido"}
                  {Number(s.total) > 0 && tarifa && " + tarifa"}
                </p>
              </div>
              <Chip tono={e.tono}>{e.texto}</Chip>
            </div>
            {s.nota && <p className="rounded-xl bg-limo px-3 py-2 text-sm">{s.nota}</p>}

            {modo === "equipo" && puedeAceptar && s.estado === "pendiente" && (
              <div className="flex gap-2">
                {boton1("aceptada", "Aceptar", true)}
                {boton1("rechazada", "Rechazar")}
              </div>
            )}
            {modo === "equipo" && s.estado === "aceptada" && <div className="flex gap-2">{boton1("hecha", "Marcar como hecho")}</div>}
            {modo === "propietario" && s.estado === "pendiente" && (
              <form action={responderSolicitud} className="-mb-2 text-right">
                <input type="hidden" name="hipica_id" value={hipicaId} />
                <input type="hidden" name="solicitud_id" value={s.id} />
                <input type="hidden" name="estado" value="retirada" />
                <input type="hidden" name="volver" value={volver} />
                <button type="submit" className={botonTexto}>
                  Retirar
                </button>
              </form>
            )}
          </li>
        );
      })}
    </ul>
  );
}
