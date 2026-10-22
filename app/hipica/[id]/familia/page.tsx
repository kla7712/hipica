import { Suspense } from "react";
import Link from "next/link";
import {
  Aviso,
  Cabecera,
  CargandoApp,
  Chip,
  Icono,
  Inicial,
  PantallaApp,
  Seccion,
  boton,
  botonTexto,
  campo,
  etiqueta,
  tarjeta,
} from "@/components/app/ui";
import { cargarContexto, fechas, navegacion } from "@/lib/hipica";
import { resumenBono, type EstadoBono } from "@/lib/tipos";
import { anadirJinete, quitarJinete } from "./actions";

const MENSAJES: Record<string, { tipo: "ok" | "error"; texto: string }> = {
  anadido: { tipo: "ok", texto: "Añadido. Ya puedes reservarle clases en Reservar." },
  nombre: { tipo: "error", texto: "Escribe el nombre." },
  maximo: { tipo: "error", texto: "Puedes tener hasta 6 jinetes a tu cargo." },
  anadir: { tipo: "error", texto: "No se ha podido añadir. Vuelve a intentarlo." },
};

export default function FamiliaPage({ params, searchParams }: PageProps<"/hipica/[id]/familia">) {
  return (
    <Suspense fallback={<CargandoApp />}>
      <Contenido params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Contenido({ params, searchParams }: PageProps<"/hipica/[id]/familia">) {
  const { id } = await params;
  const { ok, error } = await searchParams;
  const codigo = typeof ok === "string" ? ok : typeof error === "string" ? error : null;
  const mensaje = codigo && Object.hasOwn(MENSAJES, codigo) ? MENSAJES[codigo] : null;
  const ctx = await cargarContexto(id);
  const { supabase, hipica } = ctx;

  const { data } = await supabase.rpc("estado_bonos", { p_hipica: id });
  const estado = ((data ?? []) as EstadoBono[]).filter((b) => b.miembro_id === ctx.yo.id || b.titular_id === ctx.yo.id);
  const yo = estado.find((b) => b.miembro_id === ctx.yo.id);
  const hijos = estado.filter((b) => b.titular_id === ctx.yo.id);
  const hoy = fechas(hipica.zona_horaria).clave(new Date());

  const fila = (b: EstadoBono, esYo: boolean) => {
    const r = resumenBono(b, hoy);
    return (
      <li key={b.miembro_id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
        <Inicial nombre={b.nombre} tono={esYo ? "verde" : "neutro"} />
        <span className="min-w-0 flex-1">
          <span className="block font-bold">
            {b.nombre}
            {esYo && " (tú)"}
          </span>
          <span className="block text-sm text-tinta-suave">{b.nivel ?? "Nivel sin indicar"}</span>
        </span>
        {(b.bono_id || !esYo || hijos.length === 0) && <Chip tono={r.tono}>{r.texto}</Chip>}
        {!esYo && (
          <details className="w-full text-right text-sm">
            <summary className={`${botonTexto} cursor-pointer list-none hover:text-alerta`}>Quitar</summary>
            <form action={quitarJinete} className="mt-2 space-y-2 rounded-xl bg-alerta-suave p-3 text-left">
              <input type="hidden" name="hipica_id" value={id} />
              <input type="hidden" name="miembro_id" value={b.miembro_id} />
              <p className="text-alerta">Se anularán sus reservas futuras.</p>
              <button type="submit" className="inline-flex min-h-11 items-center rounded-xl bg-alerta px-4 font-bold text-white">
                Quitar a {b.nombre}
              </button>
            </form>
          </details>
        )}
      </li>
    );
  };

  return (
    <PantallaApp
      nav={navegacion(ctx, "familia")}
      cabecera={
        <Cabecera
          antetitulo={hipica.nombre}
          titulo={hijos.length ? "Tu familia" : "Tu ficha"}
          detalle="Quién monta, su nivel y cómo va su bono."
          demo={ctx.demo}
        />
      }
    >
      {mensaje && (
        <div className="mb-5">
          <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso>
        </div>
      )}

      <Seccion titulo="Jinetes" id="jinetes">
        <ul className={`${tarjeta} divide-y divide-linea overflow-hidden`}>
          {hijos.map((h) => fila(h, false))}
          {yo && fila(yo, true)}
        </ul>
        <p className="mt-3 text-sm text-tinta-suave">
          El nivel lo pone la hípica. Para comprar o renovar un bono, pídelo en recepción.
        </p>
      </Seccion>

      <Seccion titulo="Añadir un hijo o hija" id="anadir">
        <form action={anadirJinete} className={`${tarjeta} space-y-3 p-4`}>
          <input type="hidden" name="hipica_id" value={id} />
          <div className="space-y-1.5">
            <label htmlFor="nombre" className={etiqueta}>
              Nombre y apellido
            </label>
            <input id="nombre" name="nombre" required maxLength={120} className={campo} />
          </div>
          <button type="submit" className={`${boton} w-full`}>
            Añadir
          </button>
          <p className="text-sm text-tinta-suave">
            Solo guardamos el nombre. Reservarás por él desde tu cuenta; no necesita email ni móvil.
          </p>
        </form>
      </Seccion>

      <Seccion titulo="Tu cuenta" id="cuenta">
        <Link href="/cuenta" className={`${tarjeta} flex items-center gap-3 px-4 py-4 hover:bg-white/70`}>
          <span className="min-w-0 flex-1">
            <span className="block font-bold">Mi cuenta</span>
            <span className="block text-sm text-tinta-suave">Email, cerrar sesión y borrar la cuenta</span>
          </span>
          <Icono nombre="flecha" className="size-5 text-tinta-suave" />
        </Link>
      </Seccion>
    </PantallaApp>
  );
}
