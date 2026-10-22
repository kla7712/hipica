import { boton, campo, etiqueta, tarjeta } from "@/components/app/ui";
import { PUPILAJES } from "@/lib/hipica";
import { crearCaballo, editarCaballo } from "./actions";

export type DatosCaballo = {
  id: string;
  nombre: string;
  tipo: "escuela" | "propietario";
  propietario_id: string | null;
  box: string | null;
  pupilaje: string | null;
  raza: string | null;
  nacimiento: number | null;
  max_clases_dia: number;
  notas: string | null;
  dieta: string | null;
};

// Alta (sin caballo) o edición (con caballo). Solo para el administrador.
export function FormCaballo({
  hipicaId,
  titulares,
  caballo,
}: {
  hipicaId: string;
  titulares: { id: string; nombre: string }[];
  caballo?: DatosCaballo;
}) {
  const s = caballo?.id ?? "nuevo";
  return (
    <form action={caballo ? editarCaballo : crearCaballo} className={`${tarjeta} space-y-3 p-4`}>
      <input type="hidden" name="hipica_id" value={hipicaId} />
      {caballo && <input type="hidden" name="caballo_id" value={caballo.id} />}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor={`nombre-${s}`} className={etiqueta}>
            Nombre
          </label>
          <input id={`nombre-${s}`} name="nombre" required maxLength={60} defaultValue={caballo?.nombre} className={campo} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`tipo-${s}`} className={etiqueta}>
            Es de…
          </label>
          <select id={`tipo-${s}`} name="tipo" defaultValue={caballo?.tipo ?? "escuela"} className={campo}>
            <option value="escuela">La escuela</option>
            <option value="propietario">Un propietario (pupilaje)</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`propietario-${s}`} className={etiqueta}>
            Propietario <span className="font-normal text-tinta-suave">(si es de pupilaje)</span>
          </label>
          <select id={`propietario-${s}`} name="propietario_id" defaultValue={caballo?.propietario_id ?? ""} className={campo}>
            <option value="">—</option>
            {titulares.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`pupilaje-${s}`} className={etiqueta}>
            Pupilaje
          </label>
          <select id={`pupilaje-${s}`} name="pupilaje" defaultValue={caballo?.pupilaje ?? ""} className={campo}>
            <option value="">—</option>
            {Object.entries(PUPILAJES).map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`box-${s}`} className={etiqueta}>
            Box
          </label>
          <input id={`box-${s}`} name="box" maxLength={20} defaultValue={caballo?.box ?? ""} placeholder="7" className={campo} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`max-${s}`} className={etiqueta}>
            Clases al día (máx.)
          </label>
          <select id={`max-${s}`} name="max_clases_dia" defaultValue={String(caballo?.max_clases_dia ?? 3)} className={campo}>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`raza-${s}`} className={etiqueta}>
            Raza <span className="font-normal text-tinta-suave">(opcional)</span>
          </label>
          <input id={`raza-${s}`} name="raza" maxLength={60} defaultValue={caballo?.raza ?? ""} className={campo} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`nacimiento-${s}`} className={etiqueta}>
            Año de nacimiento <span className="font-normal text-tinta-suave">(opcional)</span>
          </label>
          <input
            id={`nacimiento-${s}`}
            name="nacimiento"
            type="number"
            inputMode="numeric"
            min={1980}
            max={2100}
            defaultValue={caballo?.nacimiento ?? ""}
            className={campo}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`dieta-${s}`} className={etiqueta}>
          Dieta <span className="font-normal text-tinta-suave">(opcional)</span>
        </label>
        <textarea
          id={`dieta-${s}`}
          name="dieta"
          maxLength={500}
          rows={2}
          defaultValue={caballo?.dieta ?? ""}
          placeholder="Ej.: mañana 2 kg de pienso y heno; tarde 1,5 kg"
          className={campo}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`notas-${s}`} className={etiqueta}>
          Notas <span className="font-normal text-tinta-suave">(opcional)</span>
        </label>
        <input
          id={`notas-${s}`}
          name="notas"
          maxLength={300}
          defaultValue={caballo?.notas ?? ""}
          placeholder="Ej.: tranquilo, ideal para niños"
          className={campo}
        />
      </div>
      <button type="submit" className={`${boton} w-full`}>
        {caballo ? "Guardar cambios" : "Dar de alta"}
      </button>
    </form>
  );
}
