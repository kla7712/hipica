import { Suspense } from "react";
import { notFound } from "next/navigation";
import {
  Cabecera,
  CargandoApp,
  Chip,
  PantallaApp,
  Seccion,
  boton,
  botonSecundario,
  botonTexto,
  campo,
  etiqueta,
  tarjeta,
} from "@/components/app/ui";
import { cargarContexto, ESTADOS_RECIBO, euro, METODOS, navegacion, nombreMes, nombrePila, telWhatsApp } from "@/lib/hipica";
import { UUID } from "@/lib/rutas";
import { marcarRecibo, quitarCargo } from "../actions";

type Recibo = {
  id: string;
  numero: number;
  mes: string;
  total: number;
  estado: "pendiente" | "pagado" | "devuelto";
  metodo: string | null;
  pagado_en: string | null;
  cliente: { nombre: string; telefono: string | null; datos_factura: string | null } | null;
  cargos: { id: string; concepto: string; importe: number }[];
};

export default function ReciboPage({ params }: PageProps<"/hipica/[id]/cobros/[reciboId]">) {
  return (
    <Suspense fallback={<CargandoApp />}>
      <Contenido params={params} />
    </Suspense>
  );
}

async function Contenido({ params }: Pick<PageProps<"/hipica/[id]/cobros/[reciboId]">, "params">) {
  const { id, reciboId } = await params;
  if (!UUID.test(reciboId)) notFound();
  const ctx = await cargarContexto(id);
  if (!ctx.esAdmin) notFound();
  const { supabase, hipica } = ctx;

  const { data: r } = await supabase
    .from("recibos")
    .select("id, numero, mes, total, estado, metodo, pagado_en, cliente:miembros(nombre, telefono, datos_factura), cargos(id, concepto, importe)")
    .eq("id", reciboId)
    .eq("hipica_id", id)
    .maybeSingle<Recibo>();
  if (!r) notFound();

  const { data: h } = await supabase.from("hipicas").select("instrucciones_pago").eq("id", id).single<{ instrucciones_pago: string | null }>();
  const e = ESTADOS_RECIBO[r.estado];
  const mes = nombreMes(r.mes);
  const fPago = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", timeZone: "UTC" });
  const recordatorio =
    `Hola ${nombrePila(r.cliente?.nombre ?? "")}, te recordamos el recibo de ${mes} de ${hipica.nombre}: ${euro(r.total)} ` +
    `(recibo nº ${r.numero}).${h?.instrucciones_pago ? ` ${h.instrucciones_pago}` : ""} ¡Gracias!`;
  const oculto = (
    <>
      <input type="hidden" name="hipica_id" value={id} />
      <input type="hidden" name="recibo_id" value={r.id} />
    </>
  );

  return (
    <PantallaApp
      nav={navegacion(ctx, "cobros")}
      cabecera={
        <Cabecera
          volver={{ href: `/hipica/${id}/cobros?mes=${r.mes.slice(0, 7)}`, texto: "Cobros" }}
          antetitulo={`Recibo nº ${r.numero} · ${mes}`}
          titulo={r.cliente?.nombre ?? "Cliente"}
        >
          <div className="flex items-center gap-3">
            <span className="cifra text-5xl leading-none">{euro(r.total)}</span>
            <span className="rounded-full bg-white px-3 py-1 text-sm font-bold text-cuadra">{e.texto}</span>
          </div>
        </Cabecera>
      }
    >
      <Seccion titulo="Conceptos" id="conceptos">
        <ul className={`${tarjeta} divide-y divide-linea overflow-hidden`}>
          {r.cargos.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">{c.concepto}</span>
              <span className="shrink-0 font-bold tabular-nums">{euro(c.importe)}</span>
              {r.estado === "pendiente" && (
                <form action={quitarCargo}>
                  <input type="hidden" name="hipica_id" value={id} />
                  <input type="hidden" name="cargo_id" value={c.id} />
                  <button type="submit" className={`${botonTexto} hover:text-alerta`} aria-label={`Quitar ${c.concepto}`}>
                    Quitar
                  </button>
                </form>
              )}
            </li>
          ))}
          <li className="flex items-center justify-between px-4 py-3 font-extrabold">
            <span>Total</span>
            <span className="tabular-nums">{euro(r.total)}</span>
          </li>
        </ul>
      </Seccion>

      <Seccion titulo="Cobro" id="cobro">
        <div className={`${tarjeta} space-y-4 p-4`}>
          {r.estado === "pagado" ? (
            <p>
              <Chip tono="ok">Pagado</Chip>{" "}
              {r.metodo && <span className="font-semibold">por {METODOS[r.metodo].toLowerCase()}</span>}
              {r.pagado_en && <span className="text-tinta-suave"> el {fPago.format(new Date(r.pagado_en))}</span>}
            </p>
          ) : (
            <form action={marcarRecibo} className="flex flex-wrap items-end gap-2">
              {oculto}
              <input type="hidden" name="estado" value="pagado" />
              <div className="min-w-0 flex-1 basis-40 space-y-1.5">
                <label htmlFor="metodo" className={etiqueta}>
                  Cómo ha pagado
                </label>
                <select id="metodo" name="metodo" defaultValue={r.metodo ?? "transferencia"} className={campo}>
                  {Object.entries(METODOS).map(([v, t]) => (
                    <option key={v} value={v}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className={boton}>
                Marcar como pagado
              </button>
            </form>
          )}
          <div className="flex flex-wrap gap-2">
            {r.estado !== "devuelto" && (
              <form action={marcarRecibo}>
                {oculto}
                <input type="hidden" name="estado" value="devuelto" />
                <button type="submit" className={`${botonSecundario} text-sm`}>
                  Marcar como devuelto
                </button>
              </form>
            )}
            {r.estado !== "pendiente" && (
              <form action={marcarRecibo}>
                {oculto}
                <input type="hidden" name="estado" value="pendiente" />
                <button type="submit" className={`${botonSecundario} text-sm`}>
                  Volver a pendiente
                </button>
              </form>
            )}
          </div>
        </div>
      </Seccion>

      {r.estado !== "pagado" && r.cliente?.telefono && (
        <a
          href={`https://wa.me/${telWhatsApp(r.cliente.telefono)}?text=${encodeURIComponent(recordatorio)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={`${boton} mt-6 w-full`}
        >
          Recordárselo por WhatsApp
        </a>
      )}

      <Seccion titulo="Datos para la factura" id="factura">
        <p className={`${tarjeta} p-4 ${r.cliente?.datos_factura ? "" : "text-tinta-suave"}`}>
          {r.cliente?.datos_factura ?? "No los ha rellenado. Puede hacerlo él desde su cuenta o tú desde su ficha."}
        </p>
      </Seccion>
    </PantallaApp>
  );
}
