import { Seccion, Vacio, boton, botonTexto, campo, tarjeta } from "@/components/app/ui";
import { fechas, type Contexto } from "@/lib/hipica";
import { borrarAviso, publicarAviso } from "./actions";

type AvisoTablon = { id: string; texto: string; created_at: string };

// Últimos avisos de la hípica. El admin puede publicar y borrar.
export async function Tablon({ ctx, volver }: { ctx: Contexto; volver: string }) {
  const { data } = await ctx.supabase
    .from("avisos")
    .select("id, texto, created_at")
    .eq("hipica_id", ctx.hipica.id)
    .order("created_at", { ascending: false })
    .limit(5)
    .returns<AvisoTablon[]>();
  const avisos = data ?? [];
  if (!ctx.esAdmin && avisos.length === 0) return null;

  const f = fechas(ctx.hipica.zona_horaria);
  const ahora = new Date();
  const hoy = f.clave(ahora);
  const ayer = f.clave(new Date(ahora.getTime() - 864e5));
  const hace = (fecha: string) => {
    const clave = f.clave(fecha);
    if (clave === hoy) return "Hoy";
    if (clave === ayer) return "Ayer";
    return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", timeZone: ctx.hipica.zona_horaria }).format(
      new Date(fecha),
    );
  };

  return (
    <Seccion titulo="Tablón de avisos" id="tablon">
      <div className="space-y-3">
        {avisos.length === 0 && <Vacio>No hay avisos. Lo que publiques aquí lo verán todos los alumnos.</Vacio>}
        {avisos.map((a) => (
          <article key={a.id} className={`${tarjeta} p-4`}>
            <p className="text-sm font-semibold text-tinta-suave">{hace(a.created_at)}</p>
            <p className="mt-1 whitespace-pre-line">{a.texto}</p>
            {ctx.esAdmin && (
              <form action={borrarAviso} className="-mb-2 mt-1 text-right">
                <input type="hidden" name="hipica_id" value={ctx.hipica.id} />
                <input type="hidden" name="aviso_id" value={a.id} />
                <button type="submit" className={botonTexto}>
                  Borrar
                </button>
              </form>
            )}
          </article>
        ))}
        {ctx.esAdmin && (
          <details className={`${tarjeta} group p-4`}>
            <summary className="flex min-h-11 cursor-pointer list-none items-center font-bold text-cuadra">
              + Publicar un aviso
            </summary>
            <form action={publicarAviso} className="mt-3 space-y-3">
              <input type="hidden" name="hipica_id" value={ctx.hipica.id} />
              <input type="hidden" name="volver" value={volver} />
              <label htmlFor="texto-aviso" className="sr-only">
                Texto del aviso
              </label>
              <textarea
                id="texto-aviso"
                name="texto"
                required
                maxLength={1000}
                rows={3}
                placeholder="Ej.: el sábado no hay clases por el concurso."
                className={campo}
              />
              <button type="submit" className={`${boton} w-full`}>
                Publicar para todos
              </button>
            </form>
          </details>
        )}
      </div>
    </Seccion>
  );
}
