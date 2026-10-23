import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Columna,
  Columnas,
  Resumen,
  Aviso,
  Cabecera,
  CargandoApp,
  Chip,
  Cifras,
  Icono,
  Inicial,
  PantallaApp,
  Seccion,
  Vacio,
  tarjeta,
} from "@/components/app/ui";
import { SelectAuto } from "@/components/app/select-auto";
import { cargarContexto, fechas, navegacion, PUPILAJES, UBICACIONES, campana } from "@/lib/hipica";
import { moverCaballo } from "./actions";
import { FormCaballo } from "./form-caballo";

type Caballo = {
  id: string;
  nombre: string;
  tipo: "escuela" | "propietario";
  disponible: boolean;
  max_clases_dia: number;
  box: string | null;
  pupilaje: string | null;
  ubicacion: string;
  ubicacion_desde: string;
  propietario: { nombre: string } | null;
};
type Uso = { caballo_id: string; sesiones: { inicio: string } };

const MENSAJES: Record<string, { tipo: "ok" | "error"; texto: string }> = {
  baja: { tipo: "ok", texto: "Caballo dado de baja." },
  "error-datos": { tipo: "error", texto: "Revisa los datos del caballo." },
  "error-crear": { tipo: "error", texto: "No se ha podido dar de alta. Vuelve a intentarlo." },
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
  const nav = navegacion(ctx, "caballos");

  // Un propietario va directo a la ficha de su caballo.
  if (!ctx.esEquipo) {
    if (ctx.misCaballos.length) redirect(`/hipica/${id}/caballos/${ctx.misCaballos[0].id}`);
    return (
      <PantallaApp nav={nav} cabecera={<Cabecera campana={campana(ctx)} antetitulo={hipica.nombre} titulo="Caballos" />}>
        <Vacio>Esta sección es para la hípica.</Vacio>
      </PantallaApp>
    );
  }

  const ahora = new Date();
  const [{ data: caballos }, { data: usos }, { data: titulares }, { data: datosHipica }] = await Promise.all([
    supabase
      .from("caballos")
      .select("id, nombre, tipo, disponible, max_clases_dia, box, pupilaje, ubicacion, ubicacion_desde, propietario:miembros(nombre)")
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
    esAdmin
      ? supabase
          .from("miembros")
          .select("id, nombre")
          .eq("hipica_id", id)
          .eq("activo", true)
          .eq("rol", "alumno")
          .is("titular_id", null)
          .order("nombre")
          .returns<{ id: string; nombre: string }[]>()
      : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
    supabase.from("hipicas").select("num_boxes").eq("id", id).single<{ num_boxes: number }>(),
  ]);
  const numBoxes = datosHipica?.num_boxes ?? 0;

  const hoy = f.clave(ahora);
  const clasesHoy = new Map<string, number>();
  for (const u of usos ?? []) {
    if (f.clave(u.sesiones.inicio) === hoy) clasesHoy.set(u.caballo_id, (clasesHoy.get(u.caballo_id) ?? 0) + 1);
  }
  const lista = caballos ?? [];
  const dePropietarios = lista.filter((c) => c.tipo === "propietario");
  const deEscuela = lista.filter((c) => c.tipo === "escuela");
  const fuera = lista.filter((c) => c.ubicacion !== "box").length;
  const codigo = typeof ok === "string" ? ok : typeof codigoError === "string" ? `error-${codigoError}` : null;
  const mensaje = codigo && Object.hasOwn(MENSAJES, codigo) ? MENSAJES[codigo] : null;

  const fila = (c: Caballo) => {
    const n = clasesHoy.get(c.id) ?? 0;
    const detalle =
      c.tipo === "propietario"
        ? [c.box && `Box ${c.box}`, c.propietario?.nombre ?? "Sin propietario", c.pupilaje && PUPILAJES[c.pupilaje]]
        : [c.box && `Box ${c.box}`, n === 0 ? "Sin clases hoy" : n === 1 ? "1 clase hoy" : `${n} clases hoy`];
    return (
      <li key={c.id} className="px-4 py-3 xl:flex xl:items-center xl:gap-4">
        <Link href={`/hipica/${id}/caballos/${c.id}`} className="flex items-center gap-3 xl:min-w-0 xl:flex-1">
          <Inicial nombre={c.nombre} tono={c.disponible ? "verde" : "neutro"} />
          <span className="min-w-0 flex-1">
            <span className="block font-bold">{c.nombre}</span>
            <span className="block text-sm text-tinta-suave">{detalle.filter(Boolean).join(" · ")}</span>
          </span>
          {!c.disponible ? (
            <Chip tono="atencion">En reposo</Chip>
          ) : n > c.max_clases_dia ? (
            <Chip tono="atencion">Demasiadas clases</Chip>
          ) : null}
          <Icono nombre="flecha" className="size-5 shrink-0 text-tinta-suave" />
        </Link>
        <form action={moverCaballo} className="mt-2 flex items-center gap-2 pl-[3.25rem] xl:mt-0 xl:w-80 xl:shrink-0 xl:pl-0">
          <input type="hidden" name="hipica_id" value={id} />
          <input type="hidden" name="caballo_id" value={c.id} />
          <div className="min-w-0 flex-1">
            <SelectAuto
              id={`ubicacion-${c.id}`}
              name="ubicacion"
              label={`Dónde está ${c.nombre}`}
              defaultValue={c.ubicacion}
              opciones={Object.entries(UBICACIONES).map(([valor, t]) => ({ valor, texto: t }))}
            />
          </div>
          <span className="shrink-0 text-xs text-tinta-suave">desde las {f.hora(c.ubicacion_desde)}</span>
        </form>
      </li>
    );
  };

  return (
    <PantallaApp ancho="amplio"
      nav={nav}
      cabecera={
        <Cabecera campana={campana(ctx)} antetitulo={hipica.nombre} titulo="Caballos" demo={ctx.demo}>
          <Cifras
            items={[
              { valor: dePropietarios.length, texto: "de propietarios" },
              { valor: deEscuela.length, texto: "de escuela" },
              { valor: fuera, texto: "fuera del box" },
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
      <p className="mb-5 text-sm text-tinta-suave">
        Cambia dónde está cada caballo y el propietario lo verá al momento en su móvil.
      </p>

      {lista.length === 0 && (
        <Vacio>Aún no hay caballos. {esAdmin ? "Da de alta el primero más abajo." : "El administrador puede darlos de alta."}</Vacio>
      )}

      <Columnas className="lg:grid-cols-[3fr_2fr]">
        <Columna>
      {dePropietarios.length > 0 && (
        <Seccion titulo="De propietarios" id="propietarios">
          <ul className={`${tarjeta} divide-y divide-linea overflow-hidden`}>{dePropietarios.map(fila)}</ul>
        </Seccion>
      )}

      {deEscuela.length > 0 && (
        <Seccion titulo="De la escuela" id="escuela">
          <ul className={`${tarjeta} divide-y divide-linea overflow-hidden`}>{deEscuela.map(fila)}</ul>
        </Seccion>
      )}

        </Columna>
        <Columna>
      {numBoxes > 0 && (
        <Seccion
          titulo="Boxes"
          id="boxes"
          accion={
            <span className="text-sm text-tinta-suave">
              {Array.from({ length: numBoxes }, (_, i) => String(i + 1)).filter((b) => !lista.some((c) => c.box?.trim() === b)).length} libres
            </span>
          }
        >
          <ul className="grid grid-cols-4 gap-2 sm:grid-cols-5 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: numBoxes }, (_, i) => {
              const n = String(i + 1);
              const c = lista.find((x) => x.box?.trim() === n);
              return (
                <li key={n}>
                  {c ? (
                    <Link
                      href={`/hipica/${id}/caballos/${c.id}`}
                      className="flex h-16 flex-col items-center justify-center rounded-xl bg-white px-1 text-center hover:ring-1 hover:ring-linea"
                    >
                      <span className="text-xs font-bold text-tinta-suave">{n}</span>
                      <span className="w-full truncate text-sm font-bold">{c.nombre}</span>
                    </Link>
                  ) : (
                    <span className="flex h-16 flex-col items-center justify-center rounded-xl border border-dashed border-linea text-center">
                      <span className="text-xs font-bold text-tinta-suave">{n}</span>
                      <span className="text-sm text-tinta-suave">Libre</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </Seccion>
      )}

      {esAdmin && (
        <details id="alta" className="group mt-8" open={codigo === "error-datos" || codigo === "error-crear"}>
          <Resumen>Dar de alta un caballo</Resumen>
          <div className="mt-3">
            <FormCaballo hipicaId={id} titulares={titulares ?? []} />
          </div>
        </details>
      )}
        </Columna>
      </Columnas>
    </PantallaApp>
  );
}
