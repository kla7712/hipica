import { Suspense } from "react";
import { rutaSegura } from "@/lib/rutas";
import { enviarEnlace } from "./actions";

const ERRORES: Record<string, string> = {
  email: "Escribe un email válido.",
  envio: "No hemos podido enviar el enlace. Espera un minuto y vuelve a probar.",
  enlace: "El enlace no es válido o ha caducado. Pide uno nuevo.",
};

// La parte fija de la página se sirve al instante; lo que depende de la URL
// (?enviado=… o ?error=…) va dentro de <Suspense>.
export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Entrar</h1>
          <p className="text-sm text-neutral-600">
            Te enviamos un enlace a tu email. Sin contraseñas.
          </p>
        </div>
        <Suspense>
          <Formulario searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function Formulario({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const { enviado, error, next } = await searchParams;
  const mensajeError = typeof error === "string" ? ERRORES[error] : undefined;

  if (typeof enviado === "string") {
    return (
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm">
        Revisa <strong>{enviado}</strong> y pulsa el enlace para entrar. Puede tardar un minuto;
        mira también en spam.
      </div>
    );
  }

  return (
    <form action={enviarEnlace} className="space-y-4">
      <input type="hidden" name="next" value={rutaSegura(next)} />
      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="tu@email.com"
          className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-base outline-none focus:border-neutral-900"
        />
      </div>
      {mensajeError && <p className="text-sm text-red-700">{mensajeError}</p>}
      <button
        type="submit"
        className="w-full rounded-lg bg-neutral-900 px-4 py-2.5 font-medium text-white hover:bg-neutral-800"
      >
        Enviarme el enlace
      </button>
    </form>
  );
}
