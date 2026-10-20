import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient, getUserId } from "@/lib/supabase/server";
import { Aviso, Cabecera, Pantalla, Volver, boton, campo, etiqueta } from "@/components/app/ui";
import { anadirJinete, quitarJinete } from "./actions";

const MENSAJES: Record<string, { tipo: "ok" | "error"; texto: string }> = {
  anadido: { tipo: "ok", texto: "Añadido. Ya puedes reservarle clases desde el horario." },
  nombre: { tipo: "error", texto: "Escribe el nombre." },
  maximo: { tipo: "error", texto: "Puedes tener hasta 6 jinetes a tu cargo." },
  anadir: { tipo: "error", texto: "No se ha podido añadir. Vuelve a intentarlo." },
};

export default function FamiliaPage({ params, searchParams }: PageProps<"/hipica/[id]/familia">) {
  return (
    <Pantalla>
      <Suspense fallback={<p className="text-tinta-suave">Cargando…</p>}>
        <Contenido params={params} searchParams={searchParams} />
      </Suspense>
    </Pantalla>
  );
}

async function Contenido({ params, searchParams }: PageProps<"/hipica/[id]/familia">) {
  const { id } = await params;
  const { ok, error } = await searchParams;
  const codigo = typeof ok === "string" ? ok : typeof error === "string" ? error : null;
  const mensaje = codigo && Object.hasOwn(MENSAJES, codigo) ? MENSAJES[codigo] : null;

  const userId = await getUserId();
  if (!userId) redirect("/login");

  const supabase = await createClient();
  const { data: yo } = await supabase
    .from("miembros")
    .select("id, nombre")
    .eq("hipica_id", id)
    .eq("user_id", userId)
    .eq("activo", true)
    .maybeSingle<{ id: string; nombre: string }>();
  if (!yo) notFound();

  const { data: hijos } = await supabase
    .from("miembros")
    .select("id, nombre")
    .eq("titular_id", yo.id)
    .eq("activo", true)
    .order("nombre")
    .returns<{ id: string; nombre: string }[]>();

  return (
    <div className="space-y-8">
      <Volver href={`/hipica/${id}`}>Horario</Volver>
      <Cabecera
        titulo="Mi familia"
        detalle="Añade a los jinetes que dependen de ti, como tus hijos. Podrás reservar para cada uno desde tu cuenta."
      />

      {mensaje && <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso>}

      <ul className="divide-y divide-linea overflow-hidden rounded-xl border border-linea bg-white">
        <li className="flex items-center justify-between gap-4 p-4">
          <div>
            <p className="font-semibold">{yo.nombre}</p>
            <p className="text-sm text-tinta-suave">Tú, titular de la cuenta</p>
          </div>
        </li>
        {(hijos ?? []).map((h) => (
          <li key={h.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 p-4">
            <div>
              <p className="font-semibold">{h.nombre}</p>
              <p className="text-sm text-tinta-suave">A tu cargo</p>
            </div>
            <details className="text-sm">
              <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-lg px-3 font-medium text-tinta-suave hover:text-alerta">
                Quitar
              </summary>
              <form action={quitarJinete} className="mt-2 space-y-2 rounded-lg border border-alerta/30 bg-alerta-suave p-3">
                <input type="hidden" name="hipica_id" value={id} />
                <input type="hidden" name="miembro_id" value={h.id} />
                <p className="text-alerta">Se anularán sus reservas futuras.</p>
                <button type="submit" className="inline-flex min-h-11 items-center rounded-lg bg-alerta px-4 font-semibold text-white hover:brightness-90">
                  Quitar a {h.nombre}
                </button>
              </form>
            </details>
          </li>
        ))}
      </ul>

      <section className="space-y-4">
        <h2 className="text-xl font-bold [font-stretch:85%]">Añadir un jinete</h2>
        <form action={anadirJinete} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="hipica_id" value={id} />
          <div className="min-w-0 flex-1 basis-60 space-y-2">
            <label htmlFor="nombre" className={etiqueta}>
              Nombre y apellido
            </label>
            <input id="nombre" name="nombre" required maxLength={120} className={campo} />
          </div>
          <button type="submit" className={boton}>
            Añadir
          </button>
        </form>
        <p className="text-sm text-tinta-suave">
          Solo guardamos el nombre. No hace falta email ni teléfono para los jinetes a tu cargo.
        </p>
      </section>
    </div>
  );
}
