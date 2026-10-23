import { Suspense } from "react";
import Link from "next/link";
import {
  Columna,
  Columnas,
  Resumen,
  Aviso,
  Cabecera,
  CargandoApp,
  Chip,
  Icono,
  PantallaApp,
  Seccion,
  Vacio,
  boton,
  botonSecundario,
  botonTexto,
  campo,
  etiqueta,
  tarjeta,
} from "@/components/app/ui";
import { cargarContexto, euros, navegacion, campana } from "@/lib/hipica";
import {
  borrarServicio,
  borrarTarifaBono,
  cambiarPista,
  crearPista,
  crearServicio,
  guardarAjustes,
  guardarTarifaBono,
  guardarTarifas,
  serviciosTipicos,
} from "./actions";

const MENSAJES: Record<string, { tipo: "ok" | "error"; texto: string }> = {
  guardado: { tipo: "ok", texto: "Ajustes guardados." },
  pista: { tipo: "ok", texto: "Pista añadida." },
  servicio: { tipo: "ok", texto: "Servicios actualizados." },
  tarifas: { tipo: "ok", texto: "Tarifas guardadas." },
  "error-tarifas": { tipo: "error", texto: "Revisa los precios." },
  "error-servicio": { tipo: "error", texto: "No se ha podido añadir el servicio. Revisa el nombre y el precio." },
  "error-datos": { tipo: "error", texto: "Revisa los datos." },
  "error-guardar": { tipo: "error", texto: "No se han podido guardar los ajustes. Vuelve a intentarlo." },
  "error-pista": { tipo: "error", texto: "No se ha podido añadir la pista. Revisa el nombre." },
};

type Ajustes = {
  nombre: string;
  horas_minimas_anulacion: number;
  calendario_auto: boolean;
  semanas_auto: number;
  exigir_bono: boolean;
  revisar_altas: boolean;
  recordar_clases: boolean;
  num_boxes: number;
  precio_completo: number | null;
  precio_semi: number | null;
  precio_box: number | null;
  instrucciones_pago: string | null;
};
type Pista = { id: string; nombre: string; activa: boolean };
type Servicio = { id: string; nombre: string; descripcion: string | null; precio: number | null };

export default function AjustesPage({ params, searchParams }: PageProps<"/hipica/[id]/ajustes">) {
  return (
    <Suspense fallback={<CargandoApp />}>
      <Contenido params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Contenido({ params, searchParams }: PageProps<"/hipica/[id]/ajustes">) {
  const { id } = await params;
  const { ok, error } = await searchParams;
  const ctx = await cargarContexto(id);
  const { supabase, hipica } = ctx;
  const nav = navegacion(ctx, "gestion");

  if (!ctx.esAdmin) {
    return (
      <PantallaApp nav={nav} cabecera={<Cabecera campana={campana(ctx)} antetitulo={hipica.nombre} titulo="Ajustes" />}>
        <Vacio>Solo el administrador puede cambiar los ajustes.</Vacio>
      </PantallaApp>
    );
  }

  const [{ data: h }, { data: pistas }, { data: servicios }, { data: tarifas }] = await Promise.all([
    supabase
      .from("hipicas")
      .select(
        "nombre, horas_minimas_anulacion, calendario_auto, semanas_auto, exigir_bono, revisar_altas, recordar_clases, num_boxes, precio_completo, precio_semi, precio_box, instrucciones_pago",
      )
      .eq("id", id)
      .single<Ajustes>(),
    supabase.from("pistas").select("id, nombre, activa").eq("hipica_id", id).order("orden").returns<Pista[]>(),
    supabase
      .from("servicios")
      .select("id, nombre, descripcion, precio")
      .eq("hipica_id", id)
      .eq("activo", true)
      .order("orden")
      .returns<Servicio[]>(),
    supabase.from("tarifas_bonos").select("clases, precio").eq("hipica_id", id).order("clases").returns<{ clases: number; precio: number }[]>(),
  ]);
  if (!h) throw new Error("No se han podido cargar los ajustes");

  const codigo = typeof ok === "string" ? ok : typeof error === "string" ? `error-${error}` : null;
  const mensaje = codigo && Object.hasOwn(MENSAJES, codigo) ? MENSAJES[codigo] : null;

  return (
    <PantallaApp ancho="amplio"
      nav={nav}
      cabecera={
        <Cabecera campana={campana(ctx)} antetitulo={hipica.nombre} titulo="Ajustes" demo={ctx.demo}>
          <nav aria-label="Ir a" className="sin-barra -mx-4 overflow-x-auto px-4">
            <ul className="flex gap-2">
              {[
                ["normas", "Normas"],
                ["tarifas", "Tarifas y pagos"],
                ["pistas", "Pistas"],
                ["servicios", "Servicios"],
              ].map(([ancla, texto]) => (
                <li key={ancla}>
                  <a
                    href={`#${ancla}`}
                    className="inline-flex min-h-10 items-center whitespace-nowrap rounded-full bg-white/10 px-4 text-sm font-bold hover:bg-white/20"
                  >
                    {texto}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </Cabecera>
      }
    >
      {mensaje && (
        <div className="mb-5">
          <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso>
        </div>
      )}

      <Columnas>
        <Columna>
      <Seccion titulo="Clases" id="clases">
        <Link href={`/hipica/${id}/clases`} className={`${tarjeta} flex items-center gap-3 px-4 py-4 hover:bg-white/70`}>
          <span className="min-w-0 flex-1">
            <span className="block font-bold">Horario semanal</span>
            <span className="block text-sm text-tinta-suave">Crear clases, pausarlas y publicar el calendario</span>
          </span>
          <Icono nombre="flecha" className="size-5 text-tinta-suave" />
        </Link>
      </Seccion>

      <Seccion titulo="Normas de la hípica" id="normas">
        <form action={guardarAjustes} className={`${tarjeta} space-y-6 p-4`}>
          <input type="hidden" name="hipica_id" value={id} />

          <div className="space-y-1.5">
            <label htmlFor="nombre" className={etiqueta}>
              Nombre de la hípica
            </label>
            <input id="nombre" name="nombre" required minLength={2} maxLength={120} defaultValue={h.nombre} className={campo} />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="horas" className={etiqueta}>
              Plazo para anular una reserva
            </label>
            <select id="horas" name="horas" defaultValue={String(h.horas_minimas_anulacion)} className={campo}>
              <option value="0">Hasta que empiece la clase</option>
              <option value="2">Hasta 2 horas antes</option>
              <option value="6">Hasta 6 horas antes</option>
              <option value="12">Hasta 12 horas antes</option>
              <option value="24">Hasta 24 horas antes</option>
              <option value="48">Hasta 48 horas antes</option>
            </select>
            <p className="text-sm text-tinta-suave">Pasado el plazo, solo tú puedes anular la reserva de un alumno.</p>
          </div>

          <label className="flex items-start gap-3">
            <input type="checkbox" name="exigir_bono" value="si" defaultChecked={h.exigir_bono} className="mt-1 size-5 accent-cuadra" />
            <span>
              <span className="font-bold">Pedir bono para reservar clases de grupo</span>
              <span className="block text-sm text-tinta-suave">
                Si no le quedan clases en el bono, no podrá reservar desde la app. Tú sí podrás apuntarle. La pista libre y
                las particulares no gastan bono.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3">
            <input type="checkbox" name="revisar_altas" value="si" defaultChecked={h.revisar_altas} className="mt-1 size-5 accent-cuadra" />
            <span>
              <span className="font-bold">Revisar las altas antes de aceptarlas</span>
              <span className="block text-sm text-tinta-suave">
                Quien use el enlace de alumnos rellena sus datos y espera a que lo apruebes en Gestión. Si no lo marcas,
                entra directamente.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3">
            <input type="checkbox" name="recordar_clases" value="si" defaultChecked={h.recordar_clases} className="mt-1 size-5 accent-cuadra" />
            <span>
              <span className="font-bold">Recordar las clases el día antes</span>
              <span className="block text-sm text-tinta-suave">
                Cada tarde, quien tenga clase al día siguiente recibe un aviso con la hora y su caballo.
              </span>
            </span>
          </label>

          <div className="space-y-1.5">
            <label htmlFor="num_boxes" className={etiqueta}>
              Número de boxes
            </label>
            <input
              id="num_boxes"
              name="num_boxes"
              type="number"
              inputMode="numeric"
              min={0}
              max={300}
              defaultValue={h.num_boxes}
              className={campo}
            />
            <p className="text-sm text-tinta-suave">Para ver en Caballos cuáles están libres. Numéralos del 1 en adelante.</p>
          </div>

          <fieldset className="space-y-3">
            <legend className="sr-only">Calendario</legend>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                name="calendario_auto"
                value="si"
                defaultChecked={h.calendario_auto}
                className="mt-1 size-5 accent-cuadra"
              />
              <span>
                <span className="font-bold">Publicar el calendario automáticamente</span>
                <span className="block text-sm text-tinta-suave">
                  Cada noche se publican las clases que falten, para que siempre haya semanas por delante.
                </span>
              </span>
            </label>
            <div className="space-y-1.5 pl-8">
              <label htmlFor="semanas" className={etiqueta}>
                Semanas por delante
              </label>
              <select id="semanas" name="semanas" defaultValue={String(h.semanas_auto)} className={campo}>
                {[1, 2, 3, 4, 6, 8].map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? "semana" : "semanas"}
                  </option>
                ))}
              </select>
            </div>
          </fieldset>

          <button type="submit" className={`${boton} w-full`}>
            Guardar ajustes
          </button>
        </form>
      </Seccion>

        </Columna>
        <Columna>
      <Seccion titulo="Tarifas y pagos" id="tarifas">
        <div className="space-y-3">
          <form action={guardarTarifas} className={`${tarjeta} space-y-4 p-4`}>
            <input type="hidden" name="hipica_id" value={id} />
            <p className="text-sm text-tinta-suave">Precio al mes de cada pupilaje. Se cobra solo al generar los recibos.</p>
            <div className="grid grid-cols-3 gap-3">
              {(
                [
                  ["precio_completo", "Completo", h.precio_completo],
                  ["precio_semi", "Semipupilaje", h.precio_semi],
                  ["precio_box", "Solo box", h.precio_box],
                ] as const
              ).map(([n, t, v]) => (
                <div key={n} className="space-y-1.5">
                  <label htmlFor={n} className={etiqueta}>
                    {t} (€)
                  </label>
                  <input id={n} name={n} inputMode="decimal" defaultValue={v ?? ""} className={campo} />
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="instrucciones_pago" className={etiqueta}>
                Cómo te pagan
              </label>
              <textarea
                id="instrucciones_pago"
                name="instrucciones_pago"
                rows={3}
                maxLength={500}
                defaultValue={h.instrucciones_pago ?? ""}
                placeholder="Ej.: transferencia a ES12 3456… o Bizum al 600 000 000. Pon tu nombre y el nº de recibo."
                className={campo}
              />
              <p className="text-sm text-tinta-suave">Lo ven las familias junto a su recibo y va en los recordatorios por WhatsApp.</p>
            </div>
            <button type="submit" className={`${boton} w-full`}>
              Guardar tarifas
            </button>
          </form>

          <div className={`${tarjeta} space-y-3 p-4`}>
            <p className="font-bold">Precio de los bonos</p>
            {(tarifas ?? []).length > 0 && (
              <ul className="divide-y divide-linea">
                {(tarifas ?? []).map((t) => (
                  <li key={t.clases} className="flex items-center gap-3 py-2">
                    <span className="flex-1">Bono de {t.clases} {t.clases === 1 ? "clase" : "clases"}</span>
                    <span className="font-bold">{euros(t.precio)}</span>
                    <form action={borrarTarifaBono}>
                      <input type="hidden" name="hipica_id" value={id} />
                      <input type="hidden" name="clases" value={t.clases} />
                      <button type="submit" className={`${botonTexto} hover:text-alerta`} aria-label={`Quitar bono de ${t.clases}`}>
                        Quitar
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <form action={guardarTarifaBono} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="hipica_id" value={id} />
              <div className="w-24 space-y-1.5">
                <label htmlFor="tb-clases" className={etiqueta}>
                  Clases
                </label>
                <input id="tb-clases" name="clases" type="number" inputMode="numeric" min={1} max={100} required placeholder="8" className={campo} />
              </div>
              <div className="w-28 space-y-1.5">
                <label htmlFor="tb-precio" className={etiqueta}>
                  Precio (€)
                </label>
                <input id="tb-precio" name="precio" inputMode="decimal" required placeholder="120" className={campo} />
              </div>
              <button type="submit" className={botonSecundario}>
                Guardar
              </button>
            </form>
            <p className="text-sm text-tinta-suave">Al dar un bono a un alumno se le carga este precio (lo puedes cambiar en cada bono).</p>
          </div>
        </div>
      </Seccion>

      <Seccion titulo="Pistas" id="pistas">
        <div className="space-y-3">
          {(pistas ?? []).length > 0 && (
            <ul className={`${tarjeta} divide-y divide-linea overflow-hidden`}>
              {(pistas ?? []).map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <span className={`min-w-0 flex-1 font-bold ${p.activa ? "" : "text-tinta-suave line-through"}`}>{p.nombre}</span>
                  {!p.activa && <Chip>Sin usar</Chip>}
                  <form action={cambiarPista}>
                    <input type="hidden" name="hipica_id" value={id} />
                    <input type="hidden" name="pista_id" value={p.id} />
                    <input type="hidden" name="activa" value={String(!p.activa)} />
                    <button type="submit" className={botonTexto}>
                      {p.activa ? "Dejar de usar" : "Volver a usar"}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <form action={crearPista} className={`${tarjeta} flex flex-wrap items-end gap-3 p-4`}>
            <input type="hidden" name="hipica_id" value={id} />
            <div className="min-w-0 flex-1 basis-48 space-y-1.5">
              <label htmlFor="pista-nombre" className={etiqueta}>
                Nueva pista
              </label>
              <input id="pista-nombre" name="nombre" required maxLength={60} placeholder="Ej.: Cubierta" className={campo} />
            </div>
            <button type="submit" className={botonSecundario}>
              Añadir
            </button>
          </form>
          <p className="text-sm text-tinta-suave">Así cada clase dice dónde es y en Hoy puedes ver cada pista por separado.</p>
        </div>
      </Seccion>
      <Seccion titulo="Servicios para propietarios" id="servicios">
        <div className="space-y-3">
          {(servicios ?? []).length === 0 ? (
            <form action={serviciosTipicos} className={`${tarjeta} space-y-3 p-4`}>
              <input type="hidden" name="hipica_id" value={id} />
              <p className="text-sm text-tinta-suave">
                Lo que los propietarios pueden pedir desde la app (montarlo, ducha, mantas…). Empieza con los típicos y
                ajusta los precios.
              </p>
              <button type="submit" className={`${boton} w-full`}>
                Añadir los servicios típicos
              </button>
            </form>
          ) : (
            <ul className={`${tarjeta} divide-y divide-linea overflow-hidden`}>
              {(servicios ?? []).map((sv) => (
                <li key={sv.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">{sv.nombre}</span>
                    {sv.descripcion && <span className="block text-sm text-tinta-suave">{sv.descripcion}</span>}
                  </span>
                  <span className="shrink-0 text-sm font-bold text-cuadra">{euros(sv.precio)}</span>
                  <form action={borrarServicio}>
                    <input type="hidden" name="hipica_id" value={id} />
                    <input type="hidden" name="servicio_id" value={sv.id} />
                    <button type="submit" className={`${botonTexto} hover:text-alerta`} aria-label={`Quitar ${sv.nombre}`}>
                      Quitar
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <details className={`${tarjeta} p-4 group`}>
            <Resumen>Añadir un servicio</Resumen>
            <form action={crearServicio} className="mt-3 space-y-3">
              <input type="hidden" name="hipica_id" value={id} />
              <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
                <div className="space-y-1.5">
                  <label htmlFor="sv-nombre" className={etiqueta}>
                    Nombre
                  </label>
                  <input id="sv-nombre" name="nombre" required maxLength={60} placeholder="Ej.: Esquilar" className={campo} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="sv-precio" className={etiqueta}>
                    Precio (€)
                  </label>
                  <input id="sv-precio" name="precio" inputMode="decimal" placeholder="Vacío = según tarifa" className={campo} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="sv-desc" className={etiqueta}>
                  Descripción <span className="font-normal text-tinta-suave">(opcional)</span>
                </label>
                <input id="sv-desc" name="descripcion" maxLength={120} className={campo} />
              </div>
              <button type="submit" className={`${botonSecundario} w-full`}>
                Añadir
              </button>
              <p className="text-sm text-tinta-suave">Pon 0 si va incluido en el pupilaje. Para cambiar un precio, quítalo y vuelve a añadirlo.</p>
            </form>
          </details>
        </div>
      </Seccion>
        </Columna>
      </Columnas>
    </PantallaApp>
  );
}
