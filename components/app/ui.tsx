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
export const tarjeta = "rounded-2xl bg-white";
export const titulo = "font-titulo font-extrabold tracking-tight";

/* ---------- Iconos (trazo, 24×24) ---------- */

const trazos = {
  inicio: "M4 11 12 4l8 7v9H4zM10 20v-5h4v5",
  calendario: "M4.5 4.5h15a1.5 1.5 0 0 1 1.5 1.5v13a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19V6a1.5 1.5 0 0 1 1.5-1.5zM3 9.5h18M8 2.5v4M16 2.5v4",
  herradura: "M7 20c-2-2-3-5-3-8a8 8 0 0 1 16 0c0 3-1 6-3 8M5 15h2.5M16.5 15H19M4.5 10.5H7M17 10.5h2.5",
  cuadra: "M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM9 21v-6h6v6",
  personas: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.5-3.5 3.2-5.5 6.5-5.5s6 2 6.5 5.5M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.8c2 .7 3.2 2.5 3.5 5.2",
  ajustes: "M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4",
  usuario: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c.6-4 3.8-6.5 8-6.5s7.4 2.5 8 6.5",
  atras: "m15 6-6 6 6 6",
  flecha: "m9 6 6 6-6 6",
  mas: "M12 5v14M5 12h14",
  check: "m5 12 5 5 9-10",
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

// Pantalla dentro de una hípica: cabecera verde, contenido y barra inferior.
export function PantallaApp({
  cabecera,
  nav,
  children,
}: {
  cabecera: ReactNode;
  nav?: ItemNav[];
  children: ReactNode;
}) {
  return (
    <>
      <header className="sobre-verde bg-cuadra text-white">
        <div className="mx-auto w-full max-w-2xl px-4 pb-6 pt-[max(1rem,env(safe-area-inset-top))]">{cabecera}</div>
      </header>
      <main className={`mx-auto w-full max-w-2xl flex-1 px-4 pt-5 ${nav ? "pb-32" : "pb-16"}`}>{children}</main>
      {nav && <BarraNav items={nav} />}
    </>
  );
}

// Contenido de la cabecera: línea superior (hípica / atrás + cuenta), título y extras.
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
      <div className="flex min-h-11 items-center justify-between gap-3">
        {volver ? (
          <Link
            href={volver.href}
            className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-cuadra-claro hover:text-white"
          >
            <Icono nombre="atras" className="size-5" />
            {volver.texto}
          </Link>
        ) : (
          <span className="flex min-w-0 items-center gap-2">
            {demo && (
              <span className="shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-xs font-bold uppercase tracking-wider">
                Demo
              </span>
            )}
          </span>
        )}
        {cuenta && (
          <Link
            href="/cuenta"
            className="-mr-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-cuadra-claro hover:text-white"
          >
            <Icono nombre="usuario" className="size-5" />
            Mi cuenta
          </Link>
        )}
      </div>
      <div>
        {antetitulo && <p className="text-sm font-semibold text-cuadra-claro">{antetitulo}</p>}
        <h1 className={`${titulo} text-[2rem] leading-tight first-letter:uppercase`}>{texto}</h1>
        {detalle && <p className="mt-1 text-cuadra-claro">{detalle}</p>}
      </div>
      {children}
    </div>
  );
}

// Tres cifras en la cabecera ("6 clases hoy").
export function Cifras({ items }: { items: { valor: ReactNode; texto: string; href?: string }[] }) {
  return (
    <dl className="grid grid-cols-3 gap-2.5">
      {items.map((c) => {
        const contenido = (
          <>
            <dt className="sr-only">{c.texto}</dt>
            <dd className={`${titulo} text-2xl leading-none`}>{c.valor}</dd>
            <dd aria-hidden="true" className="mt-2 text-xs font-semibold leading-tight text-cuadra-claro">
              {c.texto}
            </dd>
          </>
        );
        return c.href ? (
          <Link key={c.texto} href={c.href} className="rounded-2xl bg-white/10 p-3 hover:bg-white/15">
            {contenido}
          </Link>
        ) : (
          <div key={c.texto} className="rounded-2xl bg-white/10 p-3">
            {contenido}
          </div>
        );
      })}
    </dl>
  );
}

function BarraNav({ items }: { items: ItemNav[] }) {
  return (
    <nav
      aria-label="Secciones"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-linea bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto grid max-w-2xl" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((i) => (
          <li key={i.href}>
            <Link
              href={i.href}
              aria-current={i.activo ? "page" : undefined}
              className={`flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold ${
                i.activo ? "text-cuadra" : "text-tinta-suave hover:text-tinta"
              }`}
            >
              <span className={`rounded-full px-4 py-1 ${i.activo ? "bg-alfalfa-suave" : ""}`}>
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
      <header className="bg-cuadra">
        <div className="mx-auto w-full max-w-2xl space-y-4 px-4 pb-6 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="h-11" />
          <div className="h-4 w-32 rounded bg-white/15" />
          <div className="h-8 w-56 rounded bg-white/20" />
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-6">
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
        <h2 id={id} className="text-lg font-extrabold">
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

export function Vacio({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-linea bg-white/60 px-6 py-8 text-center text-tinta-suave">
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

// La hora grande de cada clase, a la izquierda.
export function Hora({ inicio, apagada = false }: { inicio: string; apagada?: boolean }) {
  return (
    <p
      className={`w-14 shrink-0 pt-4 text-[1.05rem] font-extrabold tabular-nums ${apagada ? "text-tinta-suave/60" : "text-tinta"}`}
    >
      {inicio}
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
              <span className={`text-[0.7rem] font-bold uppercase ${d.activo ? "text-cuadra-claro" : "text-tinta-suave"}`}>
                {d.corto}
              </span>
              <span className={`${titulo} text-xl leading-none`}>{d.numero}</span>
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
      <span className="text-[0.65rem] font-bold uppercase text-tinta-suave">{corto}</span>
      <span className={`${titulo} text-xl leading-none`}>{numero}</span>
    </span>
  );
}

// Selector de dos o tres opciones sobre la cabecera verde (enlaces).
export function Segmento({ opciones, label }: { opciones: { texto: string; href: string; activo: boolean }[]; label: string }) {
  return (
    <nav aria-label={label} className="grid rounded-xl bg-white/10 p-1" style={{ gridTemplateColumns: `repeat(${opciones.length}, minmax(0, 1fr))` }}>
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
