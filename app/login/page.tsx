import { Suspense } from "react";
import Link from "next/link";
import { rutaSegura } from "@/lib/rutas";
import { Aviso, Icono, boton, campo, etiqueta, type NombreIcono } from "@/components/app/ui";
import { demoActiva } from "@/lib/demo";
import { entrarConGoogle, entrarDemo, enviarEnlace, verificarCodigo } from "./actions";

const ERRORES: Record<string, string> = {
  email: "Escribe un email válido.",
  envio: "No se ha podido enviar el email. Vuelve a probar en un minuto.",
  limite: "Has pedido demasiados códigos seguidos. Espera unos minutos y vuelve a probar.",
  enlace: "El enlace no es válido o ha caducado. Pide un código nuevo.",
  codigo: "El código no es correcto o ha caducado. Revísalo o pide uno nuevo.",
  google: "No se ha podido entrar con Google. Prueba otra vez o usa tu email.",
  demo: "La demo no está disponible ahora mismo.",
};

const EMAIL = /^[^\s@<>]{1,64}@[^\s@<>]{1,190}$/;

// El botón de Google solo aparece cuando está configurado (LOGIN_GOOGLE=si en el servidor).
const googleActivo = () => process.env.LOGIN_GOOGLE === "si";

// La parte fija se sirve al instante; lo que depende de la URL va dentro de <Suspense>.
export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <div className="flex flex-1 flex-col lg:grid lg:min-h-screen lg:grid-cols-2">
      <header className="sobre-verde rounded-b-[2rem] bg-cuadra text-white lg:flex lg:items-center lg:rounded-none lg:rounded-r-[3rem]">
        <div className="mx-auto w-full max-w-md px-5 pb-9 pt-[max(2.5rem,env(safe-area-inset-top))] sm:pt-16 lg:max-w-lg lg:py-16">
          <span aria-hidden="true" className="mb-6 flex size-12 items-center justify-center rounded-2xl bg-alfalfa text-cuadra">
            <Icono nombre="herradura" className="size-7" />
          </span>
          <h1 className="font-titulo text-[2.75rem] font-extrabold leading-[1] tracking-tight [font-stretch:85%] lg:text-6xl">
            Tu hípica, en el móvil
          </h1>
          <p className="mt-4 max-w-sm text-lg leading-snug text-cuadra-claro">
            Clases, caballos, cuadra y cobros en un solo sitio. Las familias reservan solas; tú lo ves todo.
          </p>
        </div>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-16 pt-7 lg:flex lg:flex-col lg:justify-center lg:py-16">
        <Suspense>
          <Formulario searchParams={searchParams} />
        </Suspense>
      </main>
    </div>
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
        <h2 className="font-titulo text-2xl font-bold tracking-tight">Mira tu email</h2>
        <p className="-mt-4 text-tinta-suave">
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

  // Paso 1: probar la demo (si está activa) o entrar con Google / código por email.
  return (
    <div className="space-y-9">
      {aviso === "borrada" && <Aviso tipo="ok">Tu cuenta y todos tus datos se han borrado.</Aviso>}

      {demoActiva() && (
        <section aria-labelledby="demo" className="space-y-3">
          <div>
            <h2 id="demo" className="font-titulo text-2xl font-bold tracking-tight">
              Pruébala sin registrarte
            </h2>
            <p className="mt-1 text-tinta-suave">Una hípica de ejemplo. Toca lo que quieras: cada noche vuelve a estar como al principio.</p>
          </div>
          <OpcionDemo
            rol="admin"
            icono="cuadra"
            titulo="Probar como la hípica"
            texto="El día de hoy, las clases, los caballos, la cuadra y los cobros."
            destacada
          />
          <OpcionDemo rol="familia" icono="personas" titulo="Probar como familia" texto="Reservar clases para los hijos y pedir servicios para el caballo." />
        </section>
      )}

      <section aria-labelledby="entrar" className="space-y-4">
        <div>
          <h2 id="entrar" className="font-titulo text-2xl font-bold tracking-tight">
            {demoActiva() ? "¿Ya tienes cuenta?" : "Entra en tu hípica"}
          </h2>
          <p className="mt-1 text-tinta-suave">Te enviamos un código al email para entrar. Sin contraseñas.</p>
        </div>
        {googleActivo() && (
          <>
            <form action={entrarConGoogle}>
              <input type="hidden" name="next" value={destino} />
              <button
                type="submit"
                className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-linea bg-white px-4 font-semibold text-tinta transition-colors hover:border-tinta-suave"
              >
                Continuar con Google
              </button>
            </form>
            <div className="flex items-center gap-3 text-sm text-tinta-suave" aria-hidden="true">
              <span className="h-px flex-1 bg-linea" />o con tu email<span className="h-px flex-1 bg-linea" />
            </div>
          </>
        )}
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
      </section>
    </div>
  );
}

// Una tarjeta grande para entrar en la demo con un papel.
function OpcionDemo({
  rol,
  icono,
  titulo,
  texto,
  destacada = false,
}: {
  rol: "admin" | "familia";
  icono: NombreIcono;
  titulo: string;
  texto: string;
  destacada?: boolean;
}) {
  return (
    <form action={entrarDemo}>
      <input type="hidden" name="rol" value={rol} />
      <button
        type="submit"
        className={`flex w-full items-center gap-4 rounded-2xl border bg-white p-4 text-left transition-colors hover:border-cuadra ${
          destacada ? "border-cuadra/40" : "border-linea"
        }`}
      >
        <span
          aria-hidden="true"
          className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ${destacada ? "bg-cuadra text-alfalfa" : "bg-alfalfa-suave text-cuadra"}`}
        >
          <Icono nombre={icono} className="size-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-extrabold leading-snug">{titulo}</span>
          <span className="block text-sm text-tinta-suave">{texto}</span>
        </span>
        <Icono nombre="flecha" className="size-5 shrink-0 text-cuadra" />
      </button>
    </form>
  );
}
