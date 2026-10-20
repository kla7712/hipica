import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient, getUserId } from "@/lib/supabase/server";
import { Aviso, Cabecera, Pantalla, Volver, boton, campo, etiqueta } from "@/components/app/ui";
import { guardarAjustes } from "./actions";

const MENSAJES: Record<string, { tipo: "ok" | "error"; texto: string }> = {
  guardado: { tipo: "ok", texto: "Ajustes guardados." },
  datos: { tipo: "error", texto: "Revisa los datos." },
  guardar: { tipo: "error", texto: "No se han podido guardar los ajustes. Vuelve a intentarlo." },
};

type Hipica = {
  nombre: string;
  horas_minimas_anulacion: number;
  calendario_auto: boolean;
  semanas_auto: number;
};

export default function AjustesPage({ params, searchParams }: PageProps<"/hipica/[id]/ajustes">) {
  return (
    <Pantalla>
      <Volver href="/">Tus hípicas</Volver>
      <Suspense fallback={<p className="mt-8 text-tinta-suave">Cargando…</p>}>
        <Contenido params={params} searchParams={searchParams} />
      </Suspense>
    </Pantalla>
  );
}

async function Contenido({ params, searchParams }: PageProps<"/hipica/[id]/ajustes">) {
  const { id } = await params;
  const { ok, error } = await searchParams;
  const codigo = typeof ok === "string" ? ok : typeof error === "string" ? error : null;
  const mensaje = codigo && Object.hasOwn(MENSAJES, codigo) ? MENSAJES[codigo] : null;

  const userId = await getUserId();
  if (!userId) redirect("/login");

  const supabase = await createClient();
  const { data: yo } = await supabase
    .from("miembros")
    .select("rol, hipicas(nombre, horas_minimas_anulacion, calendario_auto, semanas_auto)")
    .eq("hipica_id", id)
    .eq("user_id", userId)
    .eq("activo", true)
    .maybeSingle<{ rol: string; hipicas: Hipica | null }>();
  if (!yo?.hipicas) notFound();
  if (yo.rol !== "admin") {
    return <p className="mt-8 text-tinta-suave">Solo el administrador puede cambiar los ajustes.</p>;
  }
  const h = yo.hipicas;

  return (
    <div className="mt-4 space-y-8">
      <Cabecera titulo="Ajustes" detalle={h.nombre} />
      {mensaje && <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso>}

      <form action={guardarAjustes} className="space-y-8">
        <input type="hidden" name="hipica_id" value={id} />

        <div className="space-y-2">
          <label htmlFor="nombre" className={etiqueta}>
            Nombre de la hípica
          </label>
          <input id="nombre" name="nombre" required minLength={2} maxLength={120} defaultValue={h.nombre} className={campo} />
        </div>

        <div className="space-y-2">
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

        <fieldset className="space-y-3 rounded-xl border border-linea bg-white p-5">
          <legend className="px-1 font-semibold">Calendario</legend>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="calendario_auto"
              value="si"
              defaultChecked={h.calendario_auto}
              className="mt-1 size-5 accent-cuadra"
            />
            <span>
              <span className="font-semibold">Publicar el calendario automáticamente</span>
              <span className="block text-sm text-tinta-suave">
                Cada noche se publican las clases que falten, para que siempre haya semanas por delante.
              </span>
            </span>
          </label>
          <div className="space-y-2">
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

        <button type="submit" className={boton}>
          Guardar ajustes
        </button>
      </form>
    </div>
  );
}
