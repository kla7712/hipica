import { Suspense } from "react";
import { crearHipica } from "./actions";

const ERRORES: Record<string, string> = {
  datos: "Rellena los dos campos.",
  crear: "No se ha podido crear la hípica. Vuelve a intentarlo.",
};

export default function NuevaHipicaPage({ searchParams }: PageProps<"/nueva-hipica">) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Crea tu hípica</h1>
          <p className="text-sm text-neutral-600">
            Serás su administrador. Después podrás invitar a monitores y alumnos.
          </p>
          <p className="text-sm text-neutral-600">
            ¿Eres alumno? No crees nada: abre el enlace de invitación que te ha enviado tu hípica.
          </p>
        </div>

        <form action={crearHipica} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="hipica" className="text-sm font-medium">
              Nombre de la hípica
            </label>
            <input
              id="hipica"
              name="hipica"
              required
              minLength={2}
              maxLength={120}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-base outline-none focus:border-neutral-900"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="nombre" className="text-sm font-medium">
              Tu nombre
            </label>
            <input
              id="nombre"
              name="nombre"
              required
              maxLength={120}
              autoComplete="name"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-base outline-none focus:border-neutral-900"
            />
          </div>
          <Suspense>
            <MensajeError searchParams={searchParams} />
          </Suspense>
          <button
            type="submit"
            className="w-full rounded-lg bg-neutral-900 px-4 py-2.5 font-medium text-white hover:bg-neutral-800"
          >
            Crear hípica
          </button>
        </form>
      </div>
    </main>
  );
}

async function MensajeError({ searchParams }: Pick<PageProps<"/nueva-hipica">, "searchParams">) {
  const { error } = await searchParams;
  const mensaje = typeof error === "string" ? ERRORES[error] : undefined;
  return mensaje ? <p className="text-sm text-red-700">{mensaje}</p> : null;
}
