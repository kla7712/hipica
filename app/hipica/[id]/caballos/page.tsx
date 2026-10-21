import { Suspense } from "react";
import {
  Aviso,
  Cabecera,
  CargandoApp,
  Chip,
  Cifras,
  Inicial,
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
import { cargarContexto, fechas, navegacion } from "@/lib/hipica";
import { cambiarEstadoCaballo, crearCaballo, editarCaballo } from "./actions";

type Caballo = {
  id: string;
  nombre: string;
  disponible: boolean;
  max_clases_dia: number;
  notas: string | null;
};
type Uso = { caballo_id: string; sesiones: { inicio: string } };

const MENSAJES: Record<string, { tipo: "ok" | "error"; texto: string }> = {
  creado: { tipo: "ok", texto: "Caballo dado de alta." },
  guardado: { tipo: "ok", texto: "Cambios guardados." },
  datos: { tipo: "error", texto: "Revisa los datos del caballo." },
  crear: { tipo: "error", texto: "No se ha podido dar de alta. Vuelve a intentarlo." },
  guardar: { tipo: "error", texto: "No se han podido guardar los cambios." },
};

export default function CaballosPage({ params, searchParams }: PageProps<"/hipica/[id]/caballos">) {
  return (
    <Suspense fallback={<CargandoApp />}>
      <Contenido params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Contenido({ params, searchParams }: PageProps<"/hipica/[id]/caballos">) {
  const { id } = await params;
  const { ok, error: codigoError } = await searchParams;
  const ctx = await cargarContexto(id);
  const { supabase, hipica, esAdmin } = ctx;
  const f = fechas(hipica.zona_horaria);
  const nav = navegacion(id, ctx.yo.rol, "caballos");

  if (!ctx.esStaff) {
    return (
      <PantallaApp nav={nav} cabecera={<Cabecera antetitulo={hipica.nombre} titulo="Caballos" />}>
        <Vacio>Esta sección es para la hípica.</Vacio>
      </PantallaApp>
    );
  }

  const ahora = new Date();
  const [{ data: caballos }, { data: usos }] = await Promise.all([
    supabase
      .from("caballos")
      .select("id, nombre, disponible, max_clases_dia, notas")
      .eq("hipica_id", id)
      .eq("activo", true)
      .order("nombre")
      .returns<Caballo[]>(),
    supabase
      .from("reservas")
      .select("caballo_id, sesiones!inner(inicio)")
      .eq("hipica_id", id)
      .eq("estado", "confirmada")
      .not("caballo_id", "is", null)
      .gte("sesiones.inicio", new Date(ahora.getTime() - 24 * 36e5).toISOString())
      .lte("sesiones.inicio", new Date(ahora.getTime() + 24 * 36e5).toISOString())
      .returns<Uso[]>(),
  ]);

  const hoy = f.clave(ahora);
  const clasesHoy = new Map<string, number>();
  for (const u of usos ?? []) {
    if (f.clave(u.sesiones.inicio) === hoy) clasesHoy.set(u.caballo_id, (clasesHoy.get(u.caballo_id) ?? 0) + 1);
  }
  const lista = caballos ?? [];
  const enReposo = lista.filter((c) => !c.disponible).length;
  const codigo = typeof ok === "string" ? ok : typeof codigoError === "string" ? codigoError : null;
  const mensaje = codigo && Object.hasOwn(MENSAJES, codigo) ? MENSAJES[codigo] : null;
  const ocultos = (caballoId?: string) => (
    <>
      <input type="hidden" name="hipica_id" value={id} />
      {caballoId && <input type="hidden" name="caballo_id" value={caballoId} />}
    </>
  );

  return (
    <PantallaApp
      nav={nav}
      cabecera={
        <Cabecera antetitulo="Caballos de escuela" titulo="Caballos" demo={ctx.demo}>
          <Cifras
            items={[
              { valor: lista.length, texto: "caballos" },
              { valor: lista.length - enReposo, texto: "disponibles" },
              { valor: enReposo, texto: "en reposo" },
            ]}
          />
        </Cabecera>
      }
    >
      {mensaje && (
        <div className="mb-5">
          <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso>
        </div>
      )}

      <Seccion titulo="Caballos" id="lista">
        {lista.length === 0 ? (
          <Vacio>
            Aún no hay caballos.{" "}
            {esAdmin ? "Da de alta los de la escuela para asignarlos en cada clase." : "El administrador puede darlos de alta."}
          </Vacio>
        ) : (
          <ul className={`${tarjeta} divide-y divide-linea overflow-hidden`}>
            {lista.map((c) => {
              const n = clasesHoy.get(c.id) ?? 0;
              return (
                <li key={c.id} className="p-4">
                  <div className="flex items-center gap-3">
                    <Inicial nombre={c.nombre} tono={c.disponible ? "verde" : "neutro"} />
                    <div className="min-w-0 flex-1">
                      <p className="font-bold">{c.nombre}</p>
                      <p className="text-sm text-tinta-suave">
                        {n === 0 ? "Sin clases hoy" : n === 1 ? "1 clase hoy" : `${n} clases hoy`} · máx. {c.max_clases_dia} al día
                      </p>
                    </div>
                    {c.disponible ? (
                      n > c.max_clases_dia ? <Chip tono="atencion">Demasiadas clases</Chip> : <Chip tono="ok">Disponible</Chip>
                    ) : (
                      <Chip tono="atencion">En reposo</Chip>
                    )}
                  </div>
                  {c.notas && <p className="mt-2 rounded-xl bg-limo px-3 py-2 text-sm">{c.notas}</p>}
                  {esAdmin && (
                    <details className="-mb-2 mt-1">
                      <summary className={`${botonTexto} cursor-pointer list-none`}>Cambiar</summary>
                      <div className="mt-2 space-y-3 rounded-xl bg-limo p-3">
                        <form action={cambiarEstadoCaballo}>
                          {ocultos(c.id)}
                          <input type="hidden" name="campo" value="disponible" />
                          <input type="hidden" name="valor" value={String(!c.disponible)} />
                          <button type="submit" className={`${botonSecundario} w-full`}>
                            {c.disponible ? "Poner en reposo" : "Ya está disponible"}
                          </button>
                        </form>
                        <form action={editarCaballo} className="space-y-3">
                          {ocultos(c.id)}
                          <CamposCaballo c={c} />
                          <button type="submit" className={`${boton} w-full`}>
                            Guardar cambios
                          </button>
                        </form>
                        <form action={cambiarEstadoCaballo} className="text-right">
                          {ocultos(c.id)}
                          <input type="hidden" name="campo" value="activo" />
                          <input type="hidden" name="valor" value="false" />
                          <button type="submit" className={`${botonTexto} hover:text-alerta`}>
                            Dar de baja a {c.nombre}
                          </button>
                        </form>
                      </div>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 text-sm text-tinta-suave">
          Un caballo en reposo no se puede asignar en las clases. El máximo diario sirve para avisarte si alguno trabaja de más.
        </p>
      </Seccion>

      {esAdmin && (
        <Seccion titulo="Dar de alta un caballo" id="alta">
          <form action={crearCaballo} className={`${tarjeta} space-y-3 p-4`}>
            {ocultos()}
            <CamposCaballo />
            <button type="submit" className={`${boton} w-full`}>
              Dar de alta
            </button>
          </form>
        </Seccion>
      )}
    </PantallaApp>
  );
}

function CamposCaballo({ c }: { c?: Caballo }) {
  const sufijo = c?.id ?? "nuevo";
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
        <div className="space-y-1.5">
          <label htmlFor={`nombre-${sufijo}`} className={etiqueta}>
            Nombre
          </label>
          <input id={`nombre-${sufijo}`} name="nombre" required maxLength={60} defaultValue={c?.nombre} className={campo} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`max-${sufijo}`} className={etiqueta}>
            Clases al día (máx.)
          </label>
          <select id={`max-${sufijo}`} name="max_clases_dia" defaultValue={String(c?.max_clases_dia ?? 3)} className={campo}>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`notas-${sufijo}`} className={etiqueta}>
          Notas <span className="font-normal text-tinta-suave">(opcional)</span>
        </label>
        <input
          id={`notas-${sufijo}`}
          name="notas"
          maxLength={300}
          defaultValue={c?.notas ?? ""}
          placeholder="Ej.: tranquilo, ideal para niños"
          className={campo}
        />
      </div>
    </>
  );
}
