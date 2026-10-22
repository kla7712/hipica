import { Suspense } from "react";
import Link from "next/link";
import {
  Resumen,
  Aviso,
  Cabecera,
  CargandoApp,
  Chip,
  Cifras,
  Filtros,
  Icono,
  PantallaApp,
  Seccion,
  Segmento,
  Vacio,
  boton,
  botonSecundario,
  botonTexto,
  campo,
  etiqueta,
  tarjeta,
} from "@/components/app/ui";
import { cargarContexto, ESTADOS_RECIBO, euro, fechas, mover, navegacion, nombreMes, type Contexto } from "@/lib/hipica";
import { crearCargo, generarRecibos, quitarCargo } from "./actions";

type Recibo = {
  id: string;
  numero: number;
  total: number;
  estado: "pendiente" | "pagado" | "devuelto";
  cliente: { nombre: string } | null;
  cargos: { concepto: string }[];
};
type Cargo = { id: string; concepto: string; importe: number; mes: string; cliente: { nombre: string } | null };

const ERRORES: Record<string, string> = {
  generar: "No se han podido generar los recibos.",
  cargo: "Revisa el concepto y el importe del cargo.",
};

export default function CobrosPage({ params, searchParams }: PageProps<"/hipica/[id]/cobros">) {
  return (
    <Suspense fallback={<CargandoApp />}>
      <Contenido params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Contenido({ params, searchParams }: PageProps<"/hipica/[id]/cobros">) {
  const { id } = await params;
  const q = await searchParams;
  const ctx = await cargarContexto(id);
  if (!ctx.esAdmin) {
    return (
      <PantallaApp nav={navegacion(ctx, "cobros")} cabecera={<Cabecera antetitulo={ctx.hipica.nombre} titulo="Cobros" />}>
        <Vacio>Solo el administrador ve los cobros.</Vacio>
      </PantallaApp>
    );
  }
  return <Cobros ctx={ctx} q={q} />;
}

async function Cobros({ ctx, q }: { ctx: Contexto; q: Record<string, string | string[] | undefined> }) {
  const { supabase, hipica } = ctx;
  const base = `/hipica/${hipica.id}`;
  const hoy = fechas(hipica.zona_horaria).clave(new Date());
  const esteMes = `${hoy.slice(0, 7)}-01`;
  const mes = typeof q.mes === "string" && /^\d{4}-\d{2}$/.test(q.mes) ? `${q.mes}-01` : esteMes;
  const filtro = ["pendiente", "pagado", "devuelto"].includes(String(q.f)) ? String(q.f) : "todos";
  const anio = Number(hoy.slice(0, 4));
  const url = (m: string, f = filtro) => `${base}/cobros?mes=${m.slice(0, 7)}${f !== "todos" ? `&f=${f}` : ""}`;

  const [{ data: recibos }, { data: sinRecibo }, { data: clientes }] = await Promise.all([
    supabase
      .from("recibos")
      .select("id, numero, total, estado, cliente:miembros(nombre), cargos(concepto)")
      .eq("hipica_id", hipica.id)
      .eq("mes", mes)
      .order("numero")
      .returns<Recibo[]>(),
    supabase
      .from("cargos")
      .select("id, concepto, importe, mes, cliente:miembros(nombre)")
      .eq("hipica_id", hipica.id)
      .is("recibo_id", null)
      .lte("mes", mes)
      .order("created_at")
      .returns<Cargo[]>(),
    supabase
      .from("miembros")
      .select("id, nombre")
      .eq("hipica_id", hipica.id)
      .eq("activo", true)
      .eq("rol", "alumno")
      .is("titular_id", null)
      .order("nombre")
      .returns<{ id: string; nombre: string }[]>(),
  ]);

  const lista = recibos ?? [];
  const suma = (e?: string) => lista.filter((r) => !e || r.estado === e).reduce((n, r) => n + Number(r.total), 0);
  const cuantos = (e: string) => lista.filter((r) => r.estado === e).length;
  const facturado = suma();
  const cobrado = suma("pagado");
  const visibles = filtro === "todos" ? lista : lista.filter((r) => r.estado === filtro);
  const pendienteFacturar = (sinRecibo ?? []).reduce((n, c) => n + Number(c.importe), 0);
  const nombre = nombreMes(mes, anio);
  const generados = typeof q.generados === "string" ? Number(q.generados) : null;
  const error = typeof q.error === "string" && Object.hasOwn(ERRORES, q.error) ? ERRORES[q.error] : null;

  return (
    <PantallaApp
      nav={navegacion(ctx, "cobros")}
      cabecera={
        <Cabecera antetitulo={hipica.nombre} titulo="Cobros" demo={ctx.demo}>
          <Segmento
            label="Mes"
            opciones={[-1, 0, 1].map((n) => {
              const m = mover(esteMes, n);
              return { texto: nombreMes(m).replace(/^./, (c) => c.toUpperCase()), href: url(m, "todos"), activo: m === mes };
            })}
          />
          {facturado > 0 ? (
            <>
              <div>
                <p className="text-sm font-semibold text-cuadra-claro">Cobrado en {nombre}</p>
                <p className="cifra mt-1 text-5xl leading-none">{euro(cobrado)}</p>
                <p className="mt-1.5 text-sm font-semibold text-cuadra-claro">de {euro(facturado)} en recibos</p>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/15" aria-hidden="true">
                <div className="h-full rounded-full bg-alfalfa" style={{ width: `${Math.round((cobrado / facturado) * 100)}%` }} />
              </div>
              <Cifras
                items={[
                  { valor: euro(suma("pendiente")), texto: `pendiente · ${cuantos("pendiente")}`, href: url(mes, "pendiente") },
                  { valor: euro(suma("devuelto")), texto: `devuelto · ${cuantos("devuelto")}`, href: url(mes, "devuelto") },
                  { valor: euro(pendienteFacturar), texto: "sin recibo", href: "#cargos" },
                ]}
              />
            </>
          ) : (
            <div>
              <p className="text-sm font-semibold text-cuadra-claro">Por pasar a recibo</p>
              <p className="cifra mt-1 text-5xl leading-none">{euro(pendienteFacturar)}</p>
              <p className="mt-1.5 text-sm font-semibold text-cuadra-claro">
                Aún no hay recibos de {nombre}. Genéralos cuando quieras cobrar.
              </p>
            </div>
          )}
        </Cabecera>
      }
    >
      <div className="space-y-3">
        {error && <Aviso tipo="error">{error}</Aviso>}
        {generados !== null && (
          <Aviso tipo="ok">
            {generados === 0
              ? "No había nada nuevo que añadir a los recibos."
              : `${generados} ${generados === 1 ? "recibo creado o actualizado" : "recibos creados o actualizados"}.`}
          </Aviso>
        )}
        <div className="grid grid-cols-2 gap-2">
          <form action={generarRecibos}>
            <input type="hidden" name="hipica_id" value={hipica.id} />
            <input type="hidden" name="mes" value={mes} />
            <button type="submit" className={`${boton} w-full`}>
              Generar recibos de {nombreMes(mes)}
            </button>
          </form>
          <a href={`${base}/cobros/exportar?mes=${mes.slice(0, 7)}`} className={`${botonSecundario} w-full`} download>
            Exportar a Excel
          </a>
        </div>
        <p className="text-sm text-tinta-suave">
          Generar junta en un recibo por cliente todo lo pendiente hasta {nombreMes(mes)}, y añade el pupilaje del mes. Puedes
          repetirlo cuando quieras. El Excel es para tu gestoría: las facturas oficiales las hace ella.
        </p>
      </div>

      <Seccion
        titulo="Cargos sin recibo"
        id="cargos"
        accion={(sinRecibo ?? []).length ? <span className="text-sm font-bold">{euro(pendienteFacturar)}</span> : undefined}
      >
        {(sinRecibo ?? []).length === 0 ? (
          <Vacio>No hay nada pendiente de pasar a recibo.</Vacio>
        ) : (
          <ul className={`${tarjeta} divide-y divide-linea overflow-hidden`}>
            {(sinRecibo ?? []).map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{c.cliente?.nombre ?? "Cliente"}</span>
                  <span className="block text-sm text-tinta-suave">
                    {c.concepto}
                    {c.mes !== mes && ` · de ${nombreMes(c.mes, anio)}`}
                  </span>
                </span>
                <span className="shrink-0 font-bold tabular-nums">{euro(c.importe)}</span>
                <form action={quitarCargo}>
                  <input type="hidden" name="hipica_id" value={hipica.id} />
                  <input type="hidden" name="cargo_id" value={c.id} />
                  <button type="submit" className={`${botonTexto} hover:text-alerta`} aria-label={`Quitar ${c.concepto}`}>
                    Quitar
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <details className={`${tarjeta} mt-3 p-4 group`}>
          <Resumen>Añadir un cargo</Resumen>
          <form action={crearCargo} className="mt-3 space-y-3">
            <input type="hidden" name="hipica_id" value={hipica.id} />
            <input type="hidden" name="mes" value={mes} />
            <div className="space-y-1.5">
              <label htmlFor="cg-cliente" className={etiqueta}>
                Cliente
              </label>
              <select id="cg-cliente" name="cliente_id" required className={campo}>
                {(clientes ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-[1fr_7rem] gap-3">
              <div className="space-y-1.5">
                <label htmlFor="cg-concepto" className={etiqueta}>
                  Concepto
                </label>
                <input id="cg-concepto" name="concepto" required maxLength={120} placeholder="Herrador · Trueno" className={campo} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="cg-importe" className={etiqueta}>
                  Importe (€)
                </label>
                <input id="cg-importe" name="importe" required inputMode="decimal" placeholder="60" className={campo} />
              </div>
            </div>
            <button type="submit" className={`${boton} w-full`}>
              Añadir cargo
            </button>
            <p className="text-sm text-tinta-suave">Para un descuento, pon el importe en negativo (por ejemplo, −20).</p>
          </form>
        </details>
      </Seccion>

      <Seccion titulo={`Recibos de ${nombre}`} id="recibos">
        {lista.length > 0 && (
          <div className="mb-3">
            <Filtros
              opciones={[
                { texto: "Todos", href: url(mes, "todos"), activo: filtro === "todos" },
                { texto: `Pendientes (${cuantos("pendiente")})`, href: url(mes, "pendiente"), activo: filtro === "pendiente" },
                { texto: `Devueltos (${cuantos("devuelto")})`, href: url(mes, "devuelto"), activo: filtro === "devuelto" },
                { texto: `Pagados (${cuantos("pagado")})`, href: url(mes, "pagado"), activo: filtro === "pagado" },
              ]}
            />
          </div>
        )}
        {visibles.length === 0 ? (
          <Vacio>{lista.length === 0 ? `Aún no hay recibos de ${nombre}.` : "Ninguno en esta lista."}</Vacio>
        ) : (
          <ul className={`${tarjeta} divide-y divide-linea overflow-hidden`}>
            {visibles.map((r) => {
              const e = ESTADOS_RECIBO[r.estado];
              return (
                <li key={r.id}>
                  <Link href={`${base}/cobros/${r.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-limo">
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold">{r.cliente?.nombre ?? "Cliente"}</span>
                      <span className="block truncate text-sm text-tinta-suave">
                        Nº {r.numero} · {r.cargos.map((c) => c.concepto.split(" · ")[0]).join(" + ")}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="font-bold tabular-nums">{euro(r.total)}</span>
                      <Chip tono={e.tono}>{e.texto}</Chip>
                    </span>
                    <Icono nombre="flecha" className="size-5 shrink-0 text-tinta-suave" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Seccion>
    </PantallaApp>
  );
}
