import { Chip, Seccion, Vacio, botonSecundario, campo, tarjeta } from "@/components/app/ui";
import { ESTADOS_RECIBO, euro, fechas, METODOS, nombreMes, PUPILAJES, type Contexto } from "@/lib/hipica";
import { guardarDatosFactura } from "./actions";

type Recibo = {
  id: string;
  numero: number;
  mes: string;
  total: number;
  estado: "pendiente" | "pagado" | "devuelto";
  metodo: string | null;
  cargos: { concepto: string; importe: number }[];
};
type Precios = {
  precio_completo: number | null;
  precio_semi: number | null;
  precio_box: number | null;
  instrucciones_pago: string | null;
};

// Lo que paga la familia: próximo recibo, recibos anteriores y cómo pagar.
export async function MisPagos({ ctx }: { ctx: Contexto }) {
  const { supabase, hipica } = ctx;
  const esteMes = `${fechas(hipica.zona_horaria).clave(new Date()).slice(0, 7)}-01`;
  const [{ data: recibos }, { data: cargos }, { data: precios }, { data: yo }, { data: caballos }, { data: yaCobrado }] = await Promise.all([
    supabase
      .from("recibos")
      .select("id, numero, mes, total, estado, metodo, cargos(concepto, importe)")
      .eq("cliente_id", ctx.yo.id)
      .order("mes", { ascending: false })
      .limit(6)
      .returns<Recibo[]>(),
    supabase
      .from("cargos")
      .select("concepto, importe")
      .eq("cliente_id", ctx.yo.id)
      .is("recibo_id", null)
      .order("created_at")
      .returns<{ concepto: string; importe: number }[]>(),
    supabase
      .from("hipicas")
      .select("precio_completo, precio_semi, precio_box, instrucciones_pago")
      .eq("id", hipica.id)
      .single<Precios>(),
    supabase.from("miembros").select("datos_factura").eq("id", ctx.yo.id).single<{ datos_factura: string | null }>(),
    supabase
      .from("caballos")
      .select("id, nombre, pupilaje")
      .eq("hipica_id", hipica.id)
      .eq("propietario_id", ctx.yo.id)
      .returns<{ id: string; nombre: string; pupilaje: string | null }[]>(),
    // Pupilajes de este mes que ya están cargados (no se vuelven a prever).
    supabase
      .from("cargos")
      .select("origen_id")
      .eq("cliente_id", ctx.yo.id)
      .eq("origen", "pupilaje")
      .eq("mes", esteMes)
      .returns<{ origen_id: string }[]>(),
  ]);
  const cargado = new Set((yaCobrado ?? []).map((c) => c.origen_id));

  // El pupilaje se añade al generar el recibo; aquí se muestra como previsto.
  const precioDe = (p: string | null) =>
    p === "completo" ? precios?.precio_completo : p === "semi" ? precios?.precio_semi : p === "box" ? precios?.precio_box : null;
  const previstos = (caballos ?? [])
    .filter((c) => c.pupilaje && Number(precioDe(c.pupilaje)) > 0 && !cargado.has(c.id))
    .map((c) => ({ concepto: `${PUPILAJES[c.pupilaje!]} · ${c.nombre}`, importe: Number(precioDe(c.pupilaje)) }));
  const lineas = [...previstos, ...(cargos ?? [])];
  const total = lineas.reduce((n, c) => n + Number(c.importe), 0);
  const pendientes = (recibos ?? []).filter((r) => r.estado !== "pagado");
  const hayAlgo = lineas.length > 0 || (recibos ?? []).length > 0;

  return (
    <>
      {hayAlgo && (
        <Seccion titulo="Próximo recibo" id="proximo">
          {lineas.length === 0 ? (
            <Vacio>Por ahora no hay nada pendiente.</Vacio>
          ) : (
            <div className={`${tarjeta} overflow-hidden`}>
              <ul className="divide-y divide-linea">
                {lineas.map((c, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <span>{c.concepto}</span>
                    <span className="shrink-0 font-bold tabular-nums">{euro(c.importe)}</span>
                  </li>
                ))}
                <li className="flex items-center justify-between px-4 py-3 font-extrabold">
                  <span>Total previsto</span>
                  <span className="tabular-nums">{euro(total)}</span>
                </li>
              </ul>
            </div>
          )}
          <p className="mt-2 text-sm text-tinta-suave">Lo que vayas pidiendo se suma aquí. La hípica te pasa el recibo cada mes.</p>
        </Seccion>
      )}

      {(recibos ?? []).length > 0 && (
        <Seccion titulo="Recibos" id="recibos">
          <ul className={`${tarjeta} divide-y divide-linea overflow-hidden`}>
            {(recibos ?? []).map((r) => {
              const e = ESTADOS_RECIBO[r.estado];
              return (
                <li key={r.id}>
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5">
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold first-letter:uppercase">{nombreMes(r.mes, new Date().getFullYear())}</span>
                        <span className="block text-sm text-tinta-suave">
                          Nº {r.numero} · {r.cargos.length} {r.cargos.length === 1 ? "concepto" : "conceptos"}
                          {r.estado === "pagado" && r.metodo && ` · ${METODOS[r.metodo].toLowerCase()}`}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span className="font-bold tabular-nums">{euro(r.total)}</span>
                        <Chip tono={e.tono}>{e.texto}</Chip>
                      </span>
                    </summary>
                    <ul className="space-y-1 px-4 pb-3.5 text-sm">
                      {r.cargos.map((c, i) => (
                        <li key={i} className="flex justify-between gap-3">
                          <span className="text-tinta-suave">{c.concepto}</span>
                          <span className="tabular-nums">{euro(c.importe)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              );
            })}
          </ul>
        </Seccion>
      )}

      {precios?.instrucciones_pago && (hayAlgo || pendientes.length > 0) && (
        <Seccion titulo="Cómo pagar" id="pagar">
          <div className={`${tarjeta} space-y-2 p-4`}>
            <p className="whitespace-pre-line">{precios.instrucciones_pago}</p>
            {pendientes.length > 0 && (
              <p className="rounded-xl bg-atencion-suave px-3 py-2 text-sm font-semibold text-atencion">
                Tienes {pendientes.length === 1 ? "un recibo" : `${pendientes.length} recibos`} sin pagar:{" "}
                {pendientes.map((r) => `nº ${r.numero} (${euro(r.total)})`).join(", ")}.
              </p>
            )}
          </div>
        </Seccion>
      )}

      {hayAlgo && (
        <Seccion titulo="Datos para la factura" id="factura">
          <form action={guardarDatosFactura} className={`${tarjeta} space-y-3 p-4`}>
            <input type="hidden" name="hipica_id" value={hipica.id} />
            <input type="hidden" name="miembro_id" value={ctx.yo.id} />
            <label htmlFor="datos_factura" className="block text-sm text-tinta-suave">
              Si necesitas factura, pon tu nombre fiscal, NIF y dirección. Se los pasamos a la gestoría.
            </label>
            <textarea
              id="datos_factura"
              name="datos_factura"
              rows={2}
              maxLength={300}
              defaultValue={yo?.datos_factura ?? ""}
              placeholder="Nombre y apellidos · NIF · Dirección"
              className={campo}
            />
            <button type="submit" className={`${botonSecundario} w-full`}>
              Guardar
            </button>
          </form>
        </Seccion>
      )}
    </>
  );
}
