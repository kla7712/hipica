"use client";

import { useState } from "react";
import { pedirServicios } from "./actions";

type Servicio = { id: string; nombre: string; descripcion: string | null; precio: number | null };

const precio = (p: number | null) =>
  p === null ? "Según tarifa" : Number(p) === 0 ? "Incluido" : `${Number(p).toLocaleString("es-ES")} €`;

// Elegir servicios y día, con el total al momento.
export function FormServicios({
  hipicaId,
  caballoId,
  servicios,
  dias,
}: {
  hipicaId: string;
  caballoId: string;
  servicios: Servicio[];
  dias: { valor: string; corto: string; numero: string }[];
}) {
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [dia, setDia] = useState(dias[0]?.valor ?? "");
  const sel = servicios.filter((s) => elegidos.includes(s.id));
  const total = sel.reduce((n, s) => n + Number(s.precio ?? 0), 0);
  const tarifa = sel.some((s) => s.precio === null);

  return (
    <form action={pedirServicios} className="space-y-6">
      <input type="hidden" name="hipica_id" value={hipicaId} />
      <input type="hidden" name="caballo_id" value={caballoId} />

      <fieldset className="min-w-0">
        <legend className="mb-3 text-lg font-extrabold">¿Qué necesitas?</legend>
        <div className="grid grid-cols-2 gap-2.5">
          {servicios.map((s) => {
            const marcado = elegidos.includes(s.id);
            return (
              <label
                key={s.id}
                className={`relative flex min-h-28 cursor-pointer flex-col gap-1 rounded-2xl border-2 bg-white p-3.5 ${
                  marcado ? "border-cuadra" : "border-transparent"
                }`}
              >
                <input
                  type="checkbox"
                  name="servicio"
                  value={s.id}
                  checked={marcado}
                  onChange={(e) =>
                    setElegidos((a) => (e.target.checked ? [...a, s.id] : a.filter((x) => x !== s.id)))
                  }
                  className="absolute right-3 top-3 size-5 accent-cuadra"
                />
                <span className="pr-7 font-bold leading-tight">{s.nombre}</span>
                {s.descripcion && <span className="text-sm leading-snug text-tinta-suave">{s.descripcion}</span>}
                <span className="mt-auto text-sm font-extrabold text-cuadra">{precio(s.precio)}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="min-w-0">
        <legend className="mb-3 text-lg font-extrabold">¿Cuándo?</legend>
        <div className="sin-barra -mx-4 flex gap-2 overflow-x-auto px-4">
          {dias.map((d) => (
            <label
              key={d.valor}
              className={`flex h-16 w-[3.25rem] shrink-0 cursor-pointer flex-col items-center justify-center rounded-2xl border ${
                dia === d.valor ? "border-cuadra bg-cuadra text-white" : "border-linea bg-white"
              }`}
            >
              <input
                type="radio"
                name="fecha"
                value={d.valor}
                checked={dia === d.valor}
                onChange={() => setDia(d.valor)}
                className="sr-only"
              />
              <span className={`text-[0.7rem] font-bold uppercase ${dia === d.valor ? "text-cuadra-claro" : "text-tinta-suave"}`}>
                {d.corto}
              </span>
              <span className="font-titulo text-xl font-extrabold leading-none">{d.numero}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor="nota" className="text-sm font-bold">
          Nota para la cuadra <span className="font-normal text-tinta-suave">(opcional)</span>
        </label>
        <textarea
          id="nota"
          name="nota"
          rows={2}
          maxLength={300}
          placeholder="Ej.: que lo trabajen suave, viene de reposo"
          className="w-full rounded-xl border border-linea bg-white px-3 py-2.5 text-base outline-none focus:border-cuadra"
        />
      </div>

      <div className="space-y-3 rounded-2xl bg-white p-4">
        <div className="flex items-baseline justify-between gap-3" aria-live="polite">
          <span className="text-sm text-tinta-suave">
            {sel.length === 0
              ? "Elige al menos un servicio"
              : `${sel.length} ${sel.length === 1 ? "servicio" : "servicios"}${tarifa ? " + tarifa" : ""}`}
          </span>
          <span className="font-titulo text-2xl font-extrabold">{total.toLocaleString("es-ES")} €</span>
        </div>
        <button
          type="submit"
          disabled={sel.length === 0}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-cuadra px-4 font-bold text-white hover:bg-cuadra-hover disabled:opacity-50"
        >
          Pedir a la hípica
        </button>
        <p className="text-sm text-tinta-suave">La hípica lo confirma. Lo que tenga precio se suma a tu próximo recibo.</p>
      </div>
    </form>
  );
}
