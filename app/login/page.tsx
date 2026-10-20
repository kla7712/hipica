import { Suspense } from "react";
import Link from "next/link";
import { rutaSegura } from "@/lib/rutas";
import { Aviso, Pantalla, boton, campo, etiqueta } from "@/components/app/ui";
import { entrarConGoogle, enviarEnlace, verificarCodigo } from "./actions";

const ERRORES: Record<string, string> = {
  email: "Escribe un email válido.",
  envio: "No se ha podido enviar el email. Vuelve a probar en un minuto.",
  limite: "Has pedido demasiados códigos seguidos. Espera unos minutos y vuelve a probar.",
  enlace: "El enlace no es válido o ha caducado. Pide un código nuevo.",
  codigo: "El código no es correcto o ha caducado. Revísalo o pide uno nuevo.",
  google: "No se ha podido entrar con Google. Prueba otra vez o usa tu email.",
};

const EMAIL = /^[^\s@<>]{1,64}@[^\s@<>]{1,190}$/;

// La parte fija se sirve al instante; lo que depende de la URL va dentro de <Suspense>.
export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <Pantalla ancho="estrecho">
      <div className="space-y-8 pt-8 sm:pt-16">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight [font-stretch:85%]">Entra en tu hípica</h1>
          <p className="text-tinta-suave">Con tu cuenta de Google o con un código que te enviamos al email. Sin contraseñas.</p>
        </div>
        <Suspense>
          <Formulario searchParams={searchParams} />
        </Suspense>
      </div>
    </Pantalla>
  );
}

async function Formulario({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const { enviado, error, next, aviso } = await searchParams;
  const mensajeError = typeof error === "string" && Object.hasOwn(ERRORES, error) ? ERRORES[error] : undefined;
  const destino = rutaSegura(next);

  // Paso 2: escribir el código. Solo se acepta un email con forma de email
  // (así nadie puede usar la URL para enseñar otro texto).
  if (typeof enviado === "string" && EMAIL.test(enviado)) {
    return (
      <div className="space-y-6">
        <p className="text-tinta-suave">
          Hemos enviado un código a <strong className="text-tinta">{enviado}</strong>. Si no llega en un minuto, mira
          en spam.
        </p>
        <form action={verificarCodigo} className="space-y-4">
          <input type="hidden" name="email" value={enviado} />
          <input type="hidden" name="next" value={destino} />
          <div className="space-y-2">
            <label htmlFor="codigo" className={etiqueta}>
              Código del email
            </label>
            <input
              id="codigo"
              name="codigo"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]{6,12}"
              maxLength={12}
              placeholder="123456"
              className={`${campo} text-center text-2xl tracking-[0.3em] tabular-nums`}
            />
          </div>
          {mensajeError && <Aviso tipo="error">{mensajeError}</Aviso>}
          <button type="submit" className={`${boton} w-full`}>
            Entrar
          </button>
        </form>
        <p className="text-sm text-tinta-suave">
          También puedes pulsar el botón del email.{" "}
          <Link
            href={destino === "/" ? "/login" : `/login?next=${encodeURIComponent(destino)}`}
            className="font-semibold text-cuadra underline"
          >
            Usar otro email
          </Link>
        </p>
      </div>
    );
  }

  // Paso 1: entrar con Google o pedir el código por email.
  return (
    <div className="space-y-6">
      {aviso === "borrada" && <Aviso tipo="ok">Tu cuenta y todos tus datos se han borrado.</Aviso>}
      <form action={entrarConGoogle}>
        <input type="hidden" name="next" value={destino} />
        <button
          type="submit"
          className="inline-flex min-h-12 w-full items-center justify-center rounded-lg border border-linea bg-white px-4 font-semibold text-tinta transition-colors hover:border-tinta-suave"
        >
          Continuar con Google
        </button>
      </form>
      <div className="flex items-center gap-3 text-sm text-tinta-suave" aria-hidden="true">
        <span className="h-px flex-1 bg-linea" />o con tu email<span className="h-px flex-1 bg-linea" />
      </div>
      <form action={enviarEnlace} className="space-y-4">
        <input type="hidden" name="next" value={destino} />
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
          Enviarme el código
        </button>
      </form>
    </div>
  );
}
