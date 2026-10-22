"use client";

import { useState } from "react";
import { solicitarAlta } from "./actions";

const NIVELES = ["Iniciación", "Galope 1", "Galope 2", "Galope 3", "Galope 4", "Galope 5", "Galope 6", "Galope 7"];
const campo =
  "w-full rounded-xl border border-linea bg-white px-3 py-2.5 text-base text-tinta outline-none focus:border-cuadra";
const etiqueta = "text-sm font-bold";

type Hijo = { nombre: string; edad: string; nivel: string };

// Formulario de alta: quién eres, quién monta y si traes caballo.
export function FormAlta({ token, revisar }: { token: string; revisar: boolean }) {
  const [yoMonto, setYoMonto] = useState(false);
  const [miNivel, setMiNivel] = useState("Iniciación");
  const [hijos, setHijos] = useState<Hijo[]>([]);
  const [conCaballo, setConCaballo] = useState(false);
  const [caballo, setCaballo] = useState({ nombre: "", raza: "", nacimiento: "", pupilaje: "completo", entrada: "" });
  const [nombre, setNombre] = useState("");

  const jinetes = [
    ...(yoMonto && nombre.trim() ? [{ nombre: nombre.trim(), yo: true, nivel: miNivel }] : []),
    ...hijos
      .filter((h) => h.nombre.trim())
      .map((h) => ({ nombre: h.nombre.trim(), yo: false, nivel: h.nivel, ...(h.edad ? { edad: Number(h.edad) } : {}) })),
  ];
  const datosCaballo = conCaballo && caballo.nombre.trim()
    ? {
        nombre: caballo.nombre.trim(),
        pupilaje: caballo.pupilaje,
        ...(caballo.raza.trim() ? { raza: caballo.raza.trim() } : {}),
        ...(/^\d{4}$/.test(caballo.nacimiento) ? { nacimiento: Number(caballo.nacimiento) } : {}),
        ...(caballo.entrada ? { entrada: caballo.entrada } : {}),
      }
    : null;
  const listo = nombre.trim() && (jinetes.length > 0 || datosCaballo);
  const cambiarHijo = (i: number, c: Partial<Hijo>) => setHijos((hs) => hs.map((h, j) => (j === i ? { ...h, ...c } : h)));

  return (
    <form action={solicitarAlta} className="space-y-7">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="jinetes" value={JSON.stringify(jinetes)} />
      <input type="hidden" name="caballo" value={datosCaballo ? JSON.stringify(datosCaballo) : ""} />

      <fieldset className="min-w-0 space-y-3">
        <legend className="mb-3 font-titulo text-xl font-bold tracking-tight">Tus datos</legend>
        <div className="space-y-1.5">
          <label htmlFor="nombre" className={etiqueta}>
            Nombre y apellidos
          </label>
          <input
            id="nombre"
            name="nombre"
            required
            maxLength={120}
            autoComplete="name"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className={campo}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="telefono" className={etiqueta}>
            Teléfono
          </label>
          <input id="telefono" name="telefono" type="tel" maxLength={30} autoComplete="tel" className={campo} />
        </div>
      </fieldset>

      <fieldset className="min-w-0 space-y-3">
        <legend className="mb-3 font-titulo text-xl font-bold tracking-tight">¿Quién va a montar?</legend>
        <label className="flex min-h-12 items-center gap-3 rounded-2xl bg-white px-4">
          <input type="checkbox" checked={yoMonto} onChange={(e) => setYoMonto(e.target.checked)} className="size-5 accent-cuadra" />
          <span className="font-bold">Yo</span>
        </label>
        {yoMonto && (
          <div className="space-y-1.5 pl-4">
            <label htmlFor="mi-nivel" className={etiqueta}>
              Tu nivel
            </label>
            <select id="mi-nivel" value={miNivel} onChange={(e) => setMiNivel(e.target.value)} className={campo}>
              {NIVELES.map((n, i) => (
                <option key={n} value={n}>
                  {n}
                  {i === 0 ? " (nunca he montado)" : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        {hijos.map((h, i) => (
          <div key={i} className="space-y-3 rounded-2xl bg-white p-4">
            <div className="flex items-center justify-between">
              <p className="font-bold">Hijo o hija {hijos.length > 1 ? i + 1 : ""}</p>
              <button
                type="button"
                onClick={() => setHijos((hs) => hs.filter((_, j) => j !== i))}
                className="min-h-10 px-2 text-sm font-semibold text-tinta-suave underline"
              >
                Quitar
              </button>
            </div>
            <div className="grid grid-cols-[1fr_5rem] gap-3">
              <div className="space-y-1.5">
                <label htmlFor={`hijo-${i}`} className={etiqueta}>
                  Nombre
                </label>
                <input
                  id={`hijo-${i}`}
                  required
                  maxLength={120}
                  value={h.nombre}
                  onChange={(e) => cambiarHijo(i, { nombre: e.target.value })}
                  className={campo}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor={`edad-${i}`} className={etiqueta}>
                  Edad
                </label>
                <input
                  id={`edad-${i}`}
                  type="number"
                  inputMode="numeric"
                  min={2}
                  max={99}
                  value={h.edad}
                  onChange={(e) => cambiarHijo(i, { edad: e.target.value })}
                  className={campo}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`nivel-${i}`} className={etiqueta}>
                Nivel
              </label>
              <select id={`nivel-${i}`} value={h.nivel} onChange={(e) => cambiarHijo(i, { nivel: e.target.value })} className={campo}>
                {NIVELES.map((n, k) => (
                  <option key={n} value={n}>
                    {n}
                    {k === 0 ? " (nunca ha montado)" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}
        {hijos.length < 6 && (
          <button
            type="button"
            onClick={() => setHijos((hs) => [...hs, { nombre: "", edad: "", nivel: "Iniciación" }])}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-dashed border-cuadra/50 font-bold text-cuadra"
          >
            + Añadir un hijo o hija
          </button>
        )}
      </fieldset>

      <fieldset className="min-w-0 space-y-3">
        <legend className="mb-3 font-titulo text-xl font-bold tracking-tight">¿Traes tu caballo?</legend>
        <label className="flex min-h-12 items-center gap-3 rounded-2xl bg-white px-4">
          <input type="checkbox" checked={conCaballo} onChange={(e) => setConCaballo(e.target.checked)} className="size-5 accent-cuadra" />
          <span className="font-bold">Sí, quiero dejarlo en pupilaje</span>
        </label>
        {conCaballo && (
          <div className="space-y-3 rounded-2xl bg-white p-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="c-nombre" className={etiqueta}>
                  Nombre
                </label>
                <input
                  id="c-nombre"
                  required
                  maxLength={60}
                  value={caballo.nombre}
                  onChange={(e) => setCaballo({ ...caballo, nombre: e.target.value })}
                  className={campo}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="c-raza" className={etiqueta}>
                  Raza
                </label>
                <input
                  id="c-raza"
                  maxLength={60}
                  value={caballo.raza}
                  onChange={(e) => setCaballo({ ...caballo, raza: e.target.value })}
                  className={campo}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="c-nac" className={etiqueta}>
                  Año de nacimiento
                </label>
                <input
                  id="c-nac"
                  inputMode="numeric"
                  maxLength={4}
                  value={caballo.nacimiento}
                  onChange={(e) => setCaballo({ ...caballo, nacimiento: e.target.value.replace(/\D/g, "") })}
                  className={campo}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="c-entrada" className={etiqueta}>
                  Llegaría el
                </label>
                <input
                  id="c-entrada"
                  type="date"
                  value={caballo.entrada}
                  onChange={(e) => setCaballo({ ...caballo, entrada: e.target.value })}
                  className={campo}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="c-pupilaje" className={etiqueta}>
                Tipo de pupilaje
              </label>
              <select
                id="c-pupilaje"
                value={caballo.pupilaje}
                onChange={(e) => setCaballo({ ...caballo, pupilaje: e.target.value })}
                className={campo}
              >
                <option value="completo">Pupilaje completo (box, comida, cama y cuidados)</option>
                <option value="semi">Semipupilaje (box, comida y cama)</option>
                <option value="box">Solo box</option>
              </select>
            </div>
          </div>
        )}
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor="nota" className={etiqueta}>
          ¿Algo más? <span className="font-normal text-tinta-suave">(opcional)</span>
        </label>
        <textarea
          id="nota"
          name="nota"
          rows={2}
          maxLength={300}
          placeholder="Ej.: le gustaría empezar en el grupo de los martes"
          className={campo}
        />
      </div>

      <div className="space-y-2">
        <button
          type="submit"
          disabled={!listo}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-cuadra px-4 font-bold text-white hover:bg-cuadra-hover disabled:opacity-50"
        >
          {revisar ? "Enviar solicitud" : "Darme de alta"}
        </button>
        {!listo && (
          <p className="text-sm text-tinta-suave">Escribe tu nombre y dinos quién va a montar o qué caballo traes.</p>
        )}
        {revisar && <p className="text-sm text-tinta-suave">La hípica revisará tu alta y te avisará.</p>}
      </div>
    </form>
  );
}
