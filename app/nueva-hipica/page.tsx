import { Suspense } from "react";
import { Aviso, Pantalla, boton, campo, etiqueta } from "@/components/app/ui";
import { crearHipica } from "./actions";

const ERRORES: Record<string, string> = {
  datos: "Rellena los dos campos.",
  crear: "No se ha podido crear la hípica. Vuelve a intentarlo.",
  limite: "Has llegado al máximo de 3 hípicas por cuenta.",
};

export default function NuevaHipicaPage({ searchParams }: PageProps<"/nueva-hipica">) {
  return (
    <Pantalla ancho="estrecho">
      <div className="space-y-8 pt-8 sm:pt-16">
        <div className="space-y-2">
          <h1 className="font-titulo text-4xl font-extrabold tracking-tight">Crea tu hípica</h1>
          <p className="text-tinta-suave">
            Serás su administrador. Después podrás crear las clases e invitar a monitores y alumnos.
          </p>
        </div>

        <form action={crearHipica} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="hipica" className={etiqueta}>
              Nombre de la hípica
            </label>
            <input id="hipica" name="hipica" required minLength={2} maxLength={120} className={campo} />
          </div>
          <div className="space-y-2">
            <label htmlFor="nombre" className={etiqueta}>
              Tu nombre
            </label>
            <input id="nombre" name="nombre" required maxLength={120} autoComplete="name" className={campo} />
          </div>
          <Suspense>
            <MensajeError searchParams={searchParams} />
          </Suspense>
          <button type="submit" className={`${boton} w-full`}>
            Crear hípica
          </button>
        </form>

        <p className="border-t border-linea pt-6 text-sm text-tinta-suave">
          ¿Eres alumno o monitor? No crees nada aquí: abre el enlace de invitación que te ha enviado tu hípica.
        </p>
      </div>
    </Pantalla>
  );
}

async function MensajeError({ searchParams }: Pick<PageProps<"/nueva-hipica">, "searchParams">) {
  const { error } = await searchParams;
  const mensaje = typeof error === "string" && Object.hasOwn(ERRORES, error) ? ERRORES[error] : undefined;
  return mensaje ? <Aviso tipo="error">{mensaje}</Aviso> : null;
}
