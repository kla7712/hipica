"use client";

// Desplegable que guarda nada más elegir (envía su formulario).
export function SelectAuto({
  id,
  name,
  label,
  defaultValue,
  opciones,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue: string;
  opciones: { valor: string; texto: string; deshabilitada?: boolean }[];
}) {
  return (
    <>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        name={name}
        defaultValue={defaultValue}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="w-full rounded-xl border border-linea bg-white px-3 py-2.5 text-base text-tinta outline-none focus:border-cuadra"
      >
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor} disabled={o.deshabilitada}>
            {o.texto}
          </option>
        ))}
      </select>
    </>
  );
}
