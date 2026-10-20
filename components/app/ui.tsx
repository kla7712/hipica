// Piezas visuales compartidas por todas las pantallas de la app.
import Link from "next/link";
import type { ReactNode } from "react";

/* ---------- Clases reutilizables ---------- */

export const boton =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-cuadra px-4 py-2.5 font-semibold text-white transition-colors hover:bg-cuadra-hover disabled:opacity-50";
export const botonSecundario =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-linea bg-white px-4 py-2.5 font-medium text-tinta transition-colors hover:border-tinta-suave";
export const botonPeligro =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-alerta px-4 py-2.5 font-semibold text-white transition-colors hover:brightness-90";
export const campo =
  "w-full rounded-lg border border-linea bg-white px-3 py-2.5 text-base text-tinta outline-none transition-colors placeholder:text-tinta-suave/70 focus:border-cuadra";
export const etiqueta = "text-sm font-semibold text-tinta";

/* ---------- Estructura ---------- */

export function Pantalla({ children, ancho = "normal" }: { children: ReactNode; ancho?: "estrecho" | "normal" }) {
  return (
    <main
      className={`mx-auto w-full flex-1 px-4 pb-16 pt-6 sm:pt-10 ${ancho === "estrecho" ? "max-w-sm" : "max-w-2xl"}`}
    >
      {children}
    </main>
  );
}

export function Volver({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-medium text-tinta-suave hover:text-tinta"
    >
      <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M10 3 5 8l5 5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {children}
    </Link>
  );
}

export function Cabecera({ titulo, detalle, accion }: { titulo: string; detalle?: ReactNode; accion?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0 space-y-1">
        <h1 className="text-3xl font-bold tracking-tight [font-stretch:85%] sm:text-4xl">{titulo}</h1>
        {detalle && <p className="text-tinta-suave">{detalle}</p>}
      </div>
      {accion}
    </header>
  );
}

export function Aviso({ tipo = "info", children }: { tipo?: "ok" | "error" | "info"; children: ReactNode }) {
  const estilos = {
    ok: "border-cuadra/25 bg-alfalfa-suave text-tinta",
    error: "border-alerta/30 bg-alerta-suave text-alerta",
    info: "border-linea bg-white text-tinta",
  }[tipo];
  return (
    <p role={tipo === "error" ? "alert" : "status"} className={`rounded-lg border px-4 py-3 text-sm ${estilos}`}>
      {children}
    </p>
  );
}

export function Vacio({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-linea bg-white/60 px-6 py-10 text-center text-tinta-suave">
      {children}
    </div>
  );
}

/* ---------- Hora en grande, como el marcador de una pista ---------- */

export function Hora({ inicio, fin, apagada = false }: { inicio: string; fin?: string; apagada?: boolean }) {
  return (
    <div className={`w-16 shrink-0 leading-none ${apagada ? "text-tinta-suave/60" : ""}`}>
      <p className="text-[1.75rem] font-bold tabular-nums tracking-tight [font-stretch:68%]">{inicio}</p>
      {fin && <p className="mt-1 text-sm tabular-nums text-tinta-suave [font-stretch:80%]">hasta {fin}</p>}
    </div>
  );
}

/* ---------- Plazas: una casilla por plaza ---------- */

export function Plazas({
  plazas,
  ocupadas,
  mias = 0,
  etiquetaMia = "Tienes plaza",
}: {
  plazas: number;
  ocupadas: number;
  mias?: number; // cuántas de las ocupadas son tuyas (tú o tus jinetes)
  etiquetaMia?: string;
}) {
  const llenas = Math.min(ocupadas, plazas);
  const libres = plazas - llenas;
  const texto =
    mias > 0
      ? etiquetaMia
      : libres === 0
        ? "Completa"
        : `${libres} ${libres === 1 ? "plaza libre" : "plazas libres"}`;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {plazas <= 16 && (
        <div className="flex gap-1" aria-hidden="true">
          {Array.from({ length: plazas }, (_, i) => {
            const ocupada = i < llenas;
            const esMia = ocupada && i >= llenas - mias;
            return (
              <span
                key={i}
                className={`h-3 w-2.5 rounded-[3px] border ${
                  esMia
                    ? "border-cuadra bg-alfalfa"
                    : ocupada
                      ? "border-cuadra bg-cuadra"
                      : "border-cuadra/40 bg-white"
                }`}
              />
            );
          })}
        </div>
      )}
      <span className={`text-sm ${mias > 0 ? "font-semibold text-cuadra" : libres === 0 ? "text-tinta-suave" : "text-tinta"}`}>
        {texto}
        {mias > 0 && libres > 0 && <span className="font-normal text-tinta-suave">, quedan {libres}</span>}
        <span className="sr-only">. {llenas} de {plazas} plazas ocupadas.</span>
      </span>
    </div>
  );
}
