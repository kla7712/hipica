// Piezas visuales compartidas por todas las pantallas de la app.
import Link from "next/link";
import type { ReactNode } from "react";

/* ---------- Clases reutilizables ---------- */

export const boton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-cuadra px-4 py-2.5 font-bold text-white transition-colors hover:bg-cuadra-hover disabled:opacity-50";
export const botonSecundario =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-linea bg-white px-4 py-2.5 font-bold text-cuadra transition-colors hover:border-tinta-suave";
export const botonPeligro =
  "inline-flex min-h-11 items-center justify-center rounded-xl bg-alerta px-4 py-2.5 font-bold text-white transition-colors hover:brightness-90";
export const botonTexto =
  "inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold text-tinta-suave underline-offset-2 hover:text-tinta hover:underline";
export const campo =
  "w-full rounded-xl border border-linea bg-white px-3 py-2.5 text-base text-tinta outline-none transition-colors placeholder:text-tinta-suave/70 focus:border-cuadra";
export const etiqueta = "text-sm font-bold text-tinta";
export const tarjeta = "rounded-2xl border border-linea bg-white";
export const titulo = "font-titulo font-extrabold tracking-tight";

/* ---------- Iconos (trazo, 24×24) ---------- */

const trazos = {
  inicio: "M4 11 12 4l8 7v9H4zM10 20v-5h4v5",
  calendario: "M4.5 4.5h15a1.5 1.5 0 0 1 1.5 1.5v13a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19V6a1.5 1.5 0 0 1 1.5-1.5zM3 9.5h18M8 2.5v4M16 2.5v4",
  herradura: "M5.6 20.5 4.3 13.4A8 8 0 1 1 19.7 13.4l-1.3 7.1h-3.3l1-6.9a4.5 4.5 0 1 0-8.2 0l1 6.9z",
  cuadra: "M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM9 21v-6h6v6",
  tarjeta: "M4.5 5.5h15a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2zM2.5 10h19M6.5 15h4",
  personas: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.5-3.5 3.2-5.5 6.5-5.5s6 2 6.5 5.5M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.8c2 .7 3.2 2.5 3.5 5.2",
  ajustes: "M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4",
  usuario: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c.6-4 3.8-6.5 8-6.5s7.4 2.5 8 6.5",
  atras: "m15 6-6 6 6 6",
  flecha: "m9 6 6 6-6 6",
  mas: "M12 5v14M5 12h14",
  check: "m5 12 5 5 9-10",
  pista: "M12 5c5 0 9 3.1 9 7s-4 7-9 7-9-3.1-9-7 4-7 9-7zM12 9c2.8 0 5 1.3 5 3s-2.2 3-5 3-5-1.3-5-3 2.2-3 5-3z",
  saco: "M8.5 3.5h7L14 7c3 1.6 4.5 4.6 4.5 8a5 5 0 0 1-5 5h-3a5 5 0 0 1-5-5c0-3.4 1.5-6.4 4.5-8zM10 7h4",
  campana: "M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20.5h4",
  euro: "M17.5 6.5A6.5 6.5 0 1 0 17.5 17.5M4 10.5h9M4 13.5h9",
} as const;

export type NombreIcono = keyof typeof trazos;

export function Icono({ nombre, className = "size-5" }: { nombre: NombreIcono; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={trazos[nombre]} />
    </svg>
  );
}

/* ---------- Estructura de pantalla con cabecera verde ---------- */

export type ItemNav = { href: string; texto: string; icono: NombreIcono; activo: boolean };

// Pantalla dentro de una hípica: cabecera verde, contenido y navegación.
// En el móvil la navegación va abajo; en el ordenador (lg) es un menú lateral fijo
// y la cabecera es una tarjeta verde. "amplio" deja usar todo el ancho (dos columnas, listas).
const anchos = { normal: "lg:max-w-3xl", amplio: "lg:max-w-6xl" } as const;

export function PantallaApp({
  cabecera,
  nav,
  ancho = "normal",
  children,
}: {
  cabecera: ReactNode;
  nav?: ItemNav[];
  ancho?: keyof typeof anchos;
  children: ReactNode;
}) {
  const max = anchos[ancho];
  return (
    <div className={`flex flex-1 flex-col lg:pr-8 ${nav ? "lg:pl-72" : "lg:pl-8"}`}>
      <header className={`sobre-verde rounded-b-[1.75rem] bg-cuadra text-white lg:mx-auto lg:mt-6 lg:w-full lg:rounded-[1.75rem] ${max}`}>
        <div className="mx-auto w-full max-w-2xl px-4 pb-5 pt-[max(0.5rem,env(safe-area-inset-top))] lg:max-w-none lg:px-8 lg:pb-7 lg:pt-3">
          {cabecera}
        </div>
      </header>
      <main className={`mx-auto w-full max-w-2xl flex-1 px-4 pt-6 lg:px-0 lg:pt-8 ${max} ${nav ? "pb-32 lg:pb-16" : "pb-16"}`}>
        {children}
      </main>
      {nav && <BarraNav items={nav} />}
    </div>
  );
}

// Dos columnas en el ordenador; en el móvil, una debajo de otra.
export function Columnas({ children, className = "lg:grid-cols-2" }: { children: ReactNode; className?: string }) {
  return <div className={`mt-8 first:mt-0 lg:grid lg:items-start lg:gap-x-10 ${className}`}>{children}</div>;
}

export function Columna({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mt-8 min-w-0 first:mt-0 lg:mt-0 ${className}`}>{children}</div>;
}

// Contenido de la cabecera: línea superior (hípica o "atrás" + cuenta), título y extras.
// En las pantallas principales el antetítulo (normalmente la hípica) va en la línea de arriba
// para que la cabecera ocupe menos; en las de detalle va encima del título.
export function Cabecera({
  antetitulo,
  titulo: texto,
  detalle,
  volver,
  cuenta = true,
  demo = false,
  children,
}: {
  antetitulo?: ReactNode;
  titulo: ReactNode;
  detalle?: ReactNode;
  volver?: { href: string; texto: string };
  cuenta?: boolean;
  demo?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex min-h-12 items-center justify-between gap-3">
        {volver ? (
          <Link
            href={volver.href}
            className="-ml-1 inline-flex min-h-11 items-center gap-1 rounded-full bg-white/10 py-1 pl-2 pr-4 text-sm font-bold hover:bg-white/20"
          >
            <Icono nombre="atras" className="size-5" />
            {volver.texto}
          </Link>
        ) : (
          <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-cuadra-claro">
            {demo && <span className="shrink-0 rounded-full bg-alfalfa px-2.5 py-0.5 text-xs font-extrabold text-tinta">Demo</span>}
            {antetitulo && <span className="truncate">{antetitulo}</span>}
          </span>
        )}
        {cuenta && (
          <Link
            href="/cuenta"
            className="-mr-1 inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-cuadra-claro hover:bg-white/10 hover:text-white"
          >
            <Icono nombre="usuario" className="size-5" />
            Mi cuenta
          </Link>
        )}
      </div>
      <div>
        {volver && antetitulo && <p className="text-sm font-semibold text-cuadra-claro">{antetitulo}</p>}
        <h1 className={`${titulo} text-[2.1rem] leading-[1.08] first-letter:uppercase lg:text-[2.6rem]`}>{texto}</h1>
        {detalle && <p className="mt-1.5 text-cuadra-claro">{detalle}</p>}
      </div>
      {children}
    </div>
  );
}

// Tres cifras en la cabecera ("6 clases hoy"), en una franja con separadores.
export function Cifras({ items }: { items: { valor: ReactNode; texto: string; href?: string }[] }) {
  return (
    <ul
      className="grid divide-x divide-white/15 rounded-2xl bg-white/[0.07]"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((c) => {
        const contenido = (
          <>
            <span className="cifra block truncate text-[1.9rem] leading-none">{c.valor}</span>
            <span className="mt-1.5 block text-xs font-semibold leading-tight text-cuadra-claro">{c.texto}</span>
          </>
        );
        return (
          <li key={c.texto} className="min-w-0">
            {c.href ? (
              <Link href={c.href} className="block h-full rounded-2xl px-3.5 py-3 hover:bg-white/10">
                {contenido}
              </Link>
            ) : (
              <div className="px-3.5 py-3">{contenido}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function BarraNav({ items }: { items: ItemNav[] }) {
  return (
    <nav
      aria-label="Secciones"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-linea bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:inset-y-0 lg:right-auto lg:w-64 lg:border-r lg:border-t-0 lg:bg-white lg:pb-6"
    >
      <div className="hidden h-24 items-center gap-3 px-6 lg:flex">
        <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-xl bg-cuadra text-alfalfa">
          <Icono nombre="herradura" className="size-6" />
        </span>
        <span className="font-titulo text-lg font-bold leading-tight tracking-tight">Tu hípica</span>
      </div>
      <ul
        className="mx-auto grid max-w-2xl lg:flex lg:max-w-none lg:flex-col lg:gap-1 lg:px-3"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((i) => (
          <li key={i.href}>
            <Link
              href={i.href}
              aria-current={i.activo ? "page" : undefined}
              className={`flex min-h-16 flex-col items-center justify-center gap-1 text-xs lg:min-h-12 lg:flex-row lg:justify-start lg:gap-3 lg:rounded-xl lg:px-3 lg:text-[0.95rem] ${
                i.activo
                  ? "font-extrabold text-tinta lg:bg-alfalfa"
                  : "font-semibold text-tinta-suave hover:text-tinta lg:hover:bg-limo"
              }`}
            >
              <span className={`rounded-full px-4 py-1 transition-colors lg:p-0 ${i.activo ? "bg-alfalfa" : ""}`}>
                <Icono nombre={i.icono} className="size-[22px]" />
              </span>
              {i.texto}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// Pantalla sencilla (login, crear hípica, cuenta…), sin cabecera verde.
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
      className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-tinta-suave hover:text-tinta"
    >
      <Icono nombre="atras" className="size-4" />
      {children}
    </Link>
  );
}

// Mientras carga una pantalla de la hípica.
export function CargandoApp() {
  return (
    <>
      <header className="rounded-b-[1.75rem] bg-cuadra lg:mx-auto lg:mt-6 lg:w-full lg:max-w-3xl lg:rounded-[1.75rem]">
        <div className="mx-auto w-full max-w-2xl space-y-4 px-4 pb-5 pt-[max(0.5rem,env(safe-area-inset-top))] lg:max-w-none lg:px-8">
          <div className="flex h-12 items-center">
            <div className="h-4 w-32 rounded bg-white/15" />
          </div>
          <div className="h-9 w-56 rounded-lg bg-white/20" />
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-6 lg:max-w-3xl lg:px-0">
        <p className="text-tinta-suave" role="status">
          Cargando…
        </p>
      </main>
    </>
  );
}

/* ---------- Bloques de contenido ---------- */

export function Seccion({
  titulo: texto,
  accion,
  children,
  id,
}: {
  titulo: ReactNode;
  accion?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section className="mt-8 first:mt-0" aria-labelledby={id}>
      <div className="mb-3 flex min-h-8 items-center justify-between gap-3">
        <h2 id={id} className="font-titulo text-xl font-bold tracking-tight">
          {texto}
        </h2>
        {accion}
      </div>
      {children}
    </section>
  );
}

type Tono = "ok" | "atencion" | "info" | "neutro" | "alerta" | "mio";

const tonos: Record<Tono, string> = {
  ok: "bg-ok-suave text-ok",
  atencion: "bg-atencion-suave text-atencion",
  info: "bg-info-suave text-info",
  neutro: "bg-neutro-suave text-neutro",
  alerta: "bg-alerta-suave text-alerta",
  mio: "bg-alfalfa text-tinta",
};

export function Chip({ tono = "neutro", children }: { tono?: Tono; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${tonos[tono]}`}>
      {children}
    </span>
  );
}

export function Aviso({ tipo = "info", children }: { tipo?: "ok" | "error" | "info" | "atencion"; children: ReactNode }) {
  const estilos = {
    ok: "bg-ok-suave text-ok",
    error: "bg-alerta-suave text-alerta",
    info: "bg-white text-tinta",
    atencion: "bg-atencion-suave text-atencion",
  }[tipo];
  return (
    <p role={tipo === "error" ? "alert" : "status"} className={`rounded-2xl px-4 py-3 text-sm font-semibold ${estilos}`}>
      {children}
    </p>
  );
}

// Cabecera de un bloque desplegable ("+ Añadir…"). El <details> que lo envuelve lleva la clase "group".
export function Resumen({ children }: { children: ReactNode }) {
  return (
    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 font-bold text-cuadra [&::-webkit-details-marker]:hidden">
      <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-alfalfa-suave">
        <Icono nombre="mas" className="size-4 transition-transform group-open:rotate-45" />
      </span>
      {children}
    </summary>
  );
}

export function Vacio({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-tinta-suave/30 px-6 py-7 text-center text-tinta-suave">
      {children}
    </div>
  );
}

// Barra de ocupación de una clase.
export function Barra({ ocupadas, plazas }: { ocupadas: number; plazas: number }) {
  const pct = plazas > 0 ? Math.min(100, Math.round((ocupadas / plazas) * 100)) : 0;
  return (
    <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-barra-vacia">
      <div className={`h-full rounded-full ${pct >= 100 ? "bg-punto-atencion" : "bg-barra"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// "6/8", "Completa · 2 en espera", "2/4 jinetes"…
export function ChipOcupacion({
  ocupadas,
  plazas,
  enEspera = 0,
  tipo,
  cancelada = false,
}: {
  ocupadas: number;
  plazas: number;
  enEspera?: number;
  tipo: string;
  cancelada?: boolean;
}) {
  if (cancelada) return <Chip tono="alerta">Cancelada</Chip>;
  if (tipo === "particular") return ocupadas >= plazas ? <Chip tono="atencion">Reservada</Chip> : <Chip>Libre</Chip>;
  if (ocupadas >= plazas)
    return <Chip tono="atencion">{enEspera > 0 ? `Completa · ${enEspera} en espera` : "Completa"}</Chip>;
  return (
    <Chip tono={tipo === "libre" ? "info" : "ok"}>
      {ocupadas}/{plazas}
      {tipo === "libre" ? " jinetes" : ""}
    </Chip>
  );
}

// La hora de cada clase, a la izquierda, como en un marcador: inicio grande y fin debajo.
export function Hora({ inicio, fin, apagada = false }: { inicio: string; fin?: string; apagada?: boolean }) {
  return (
    <p className={`w-[3.4rem] shrink-0 pt-3.5 ${apagada ? "text-tinta-suave/60" : "text-tinta"}`}>
      <span className="cifra block text-[1.55rem] leading-none">{inicio}</span>
      {fin && (
        <span className="mt-1 block text-xs font-semibold tabular-nums text-tinta-suave">
          <span className="sr-only">hasta las </span>
          {fin}
        </span>
      )}
    </p>
  );
}

// Datos cortos de una fila (pista, monitor, nivel…), cada uno con su icono.
export function Meta({ items, className = "" }: { items: { icono?: NombreIcono; texto: ReactNode }[]; className?: string }) {
  const visibles = items.filter((i) => i.texto);
  if (visibles.length === 0) return null;
  return (
    <p className={`flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-tinta-suave ${className}`}>
      {visibles.map((i, k) => (
        <span key={k} className="inline-flex min-w-0 items-center gap-1">
          {i.icono && <Icono nombre={i.icono} className="size-4 shrink-0 opacity-80" />}
          {i.texto}
        </span>
      ))}
    </p>
  );
}

// Fila de días para elegir fecha (enlaces).
export function Dias({
  dias,
}: {
  dias: { clave: string; corto: string; numero: string; href: string; activo: boolean; marca?: boolean }[];
}) {
  return (
    <nav aria-label="Elegir día" className="sin-barra -mx-4 overflow-x-auto px-4">
      <ul className="flex gap-2">
        {dias.map((d) => (
          <li key={d.clave}>
            <Link
              href={d.href}
              scroll={false}
              aria-current={d.activo ? "date" : undefined}
              className={`relative flex h-16 w-[3.25rem] flex-col items-center justify-center rounded-2xl border text-center ${
                d.activo ? "border-cuadra bg-cuadra text-white" : "border-linea bg-white text-tinta hover:border-tinta-suave"
              }`}
            >
              <span className={`text-xs font-bold first-letter:uppercase ${d.activo ? "text-cuadra-claro" : "text-tinta-suave"}`}>
                {d.corto}
              </span>
              <span className="cifra text-2xl leading-none">{d.numero}</span>
              {d.marca && (
                <span
                  className={`absolute bottom-1.5 size-1.5 rounded-full ${d.activo ? "bg-alfalfa" : "bg-cuadra"}`}
                  aria-label="Tienes clase"
                />
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// Filtros en forma de pastilla (enlaces).
export function Filtros({ opciones }: { opciones: { texto: string; href: string; activo: boolean }[] }) {
  return (
    <nav aria-label="Filtrar" className="sin-barra -mx-4 overflow-x-auto px-4">
      <ul className="flex gap-2">
        {opciones.map((o) => (
          <li key={o.texto}>
            <Link
              href={o.href}
              scroll={false}
              aria-current={o.activo ? "true" : undefined}
              className={`inline-flex min-h-10 items-center whitespace-nowrap rounded-full border px-4 text-sm font-bold ${
                o.activo ? "border-cuadra bg-cuadra text-white" : "border-linea bg-white text-tinta hover:border-tinta-suave"
              }`}
            >
              {o.texto}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// Lista de filas dentro de una tarjeta blanca.
export function Lista({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <ul aria-label={label} className={`${tarjeta} divide-y divide-linea overflow-hidden`}>
      {children}
    </ul>
  );
}

// Círculo con la inicial (personas, caballos).
export function Inicial({ nombre, tono = "neutro" }: { nombre: string; tono?: "neutro" | "verde" }) {
  return (
    <span
      aria-hidden="true"
      className={`flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${
        tono === "verde" ? "bg-cuadra text-white" : "bg-superficie text-cuadra"
      }`}
    >
      {nombre.trim().charAt(0).toUpperCase()}
    </span>
  );
}

// Fecha en una casilla ("JUE 22").
export function CasillaFecha({ corto, numero }: { corto: string; numero: string }) {
  return (
    <span className="flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-superficie">
      <span className="text-xs font-bold text-tinta-suave first-letter:uppercase">{corto}</span>
      <span className="cifra text-2xl leading-none">{numero}</span>
    </span>
  );
}

// Selector de dos o tres opciones sobre la cabecera verde (enlaces).
export function Segmento({ opciones, label }: { opciones: { texto: string; href: string; activo: boolean }[]; label: string }) {
  return (
    <nav aria-label={label} className="grid rounded-xl bg-white/10 p-1 lg:max-w-lg" style={{ gridTemplateColumns: `repeat(${opciones.length}, minmax(0, 1fr))` }}>
      {opciones.map((o) => (
        <Link
          key={o.texto}
          href={o.href}
          scroll={false}
          aria-current={o.activo ? "page" : undefined}
          className={`flex min-h-10 items-center justify-center rounded-lg text-sm font-bold ${
            o.activo ? "bg-white text-cuadra" : "text-cuadra-claro hover:text-white"
          }`}
        >
          {o.texto}
        </Link>
      ))}
    </nav>
  );
}

// Barra de progreso sobre la cabecera verde.
export function Progreso({ hechas, total, texto }: { hechas: number; total: number; texto: string }) {
  const pct = total ? Math.round((hechas / total) * 100) : 0;
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm font-semibold text-cuadra-claro">
        <span>{texto}</span>
        <span className="tabular-nums">
          {hechas} de {total} hechas
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={texto}>
        <div className="h-full rounded-full bg-alfalfa" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
