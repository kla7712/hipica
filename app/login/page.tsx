import { Suspense } from "react";
import { rutaSegura } from "@/lib/rutas";
import { Aviso, Pantalla, boton, campo, etiqueta } from "@/components/app/ui";
import { enviarEnlace } from "./actions";

const ERRORES: Record<string, string> = {
  email: "Escribe un email válido.",
  envio: "No se ha podido enviar el enlace. Espera un minuto y vuelve a probar.",
  enlace: "El enlace no es válido o ha caducado. Pide uno nuevo.",
};

// La parte fija se sirve al instante; lo que depende de la URL va dentro de <Suspense>.
export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <Pantalla ancho="estrecho">
      <div className="space-y-8 pt-8 sm:pt-16">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight [font-stretch:85%]">Entra en tu hípica</h1>
          <p className="text-tinta-suave">Te enviamos un enlace al email para entrar. Sin contraseñas.</p>
        </div>
        <Suspense>
          <Formulario searchParams={searchParams} />
        </Suspense>
      </div>
    </Pantalla>
  );
}

async function Formulario({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const { enviado, error, next } = await searchParams;
  const mensajeError = typeof error === "string" ? ERRORES[error] : undefined;

  if (typeof enviado === "string") {
    return (
      <div className="space-y-3 rounded-xl border border-linea bg-white p-5">
        <p className="text-lg font-semibold">Revisa tu correo</p>
        <p className="text-tinta-suave">
          Hemos enviado un enlace a <strong className="text-tinta">{enviado}</strong>. Ábrelo en este mismo
          navegador para entrar. Si no llega en un minuto, mira en spam.
        </p>
      </div>
    );
  }

  return (
    <form action={enviarEnlace} className="space-y-4">
      <input type="hidden" name="next" value={rutaSegura(next)} />
      <div className="space-y-2">
        <label htmlFor="email" className={etiqueta}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder="tu@email.com"
          className={campo}
        />
      </div>
      {mensajeError && <Aviso tipo="error">{mensajeError}</Aviso>}
      <button type="submit" className={`${boton} w-full`}>
        Enviarme el enlace
      </button>
    </form>
  );
}
