import Link from "next/link";
import { Chip, Icono, Inicial, Seccion, tarjeta } from "@/components/app/ui";
import { fechas, PUPILAJES, UBICACIONES, type Contexto } from "@/lib/hipica";
import { ListaCuidados, type Cuidado } from "./caballos/cuidados";
import { ListaSolicitudes, type Solicitud } from "./servicios/solicitudes";

type Caballo = { id: string; nombre: string; box: string | null; pupilaje: string | null; ubicacion: string; ubicacion_desde: string };

// En Inicio, para los propietarios: dónde está su caballo, qué cuidados
// le tocan y cómo van sus peticiones.
export async function MisCaballos({ ctx }: { ctx: Contexto }) {
  const { supabase, hipica } = ctx;
  const ids = ctx.misCaballos.map((c) => c.id);
  if (!ids.length) return null;

  const f = fechas(hipica.zona_horaria);
  const hoy = f.clave(new Date());
  const en14 = new Date(Date.parse(`${hoy}T12:00:00Z`) + 14 * 864e5).toISOString().slice(0, 10);
  const base = `/hipica/${hipica.id}`;

  const [{ data: caballos }, { data: cuidados }, { data: solicitudes }] = await Promise.all([
    supabase
      .from("caballos")
      .select("id, nombre, box, pupilaje, ubicacion, ubicacion_desde")
      .in("id", ids)
      .order("nombre")
      .returns<Caballo[]>(),
    supabase
      .from("cuidados")
      .select("id, caballo_id, tipo, fecha, nota, responsable")
      .in("caballo_id", ids)
      .eq("hecho", false)
      .lte("fecha", en14)
      .order("fecha")
      .returns<Cuidado[]>(),
    supabase
      .from("solicitudes")
      .select("id, caballo_id, fecha, servicios, total, nota, estado, created_at")
      .in("caballo_id", ids)
      .in("estado", ["pendiente", "aceptada"])
      .gte("fecha", hoy)
      .order("fecha")
      .limit(4)
      .returns<Solicitud[]>(),
  ]);
  const nombres = new Map((caballos ?? []).map((c) => [c.id, c.nombre]));
  const varios = ids.length > 1;

  return (
    <>
      <Seccion titulo={varios ? "Tus caballos" : "Tu caballo"} id="caballo">
        <ul className="space-y-2.5">
          {(caballos ?? []).map((c) => {
            const desde = f.clave(c.ubicacion_desde) === hoy ? `desde las ${f.hora(c.ubicacion_desde)}` : `desde el ${f.medio(c.ubicacion_desde)}`;
            return (
              <li key={c.id}>
                <Link href={`${base}/caballos/${c.id}`} className={`${tarjeta} flex items-center gap-3 p-4 hover:ring-1 hover:ring-linea`}>
                  <Inicial nombre={c.nombre} tono="verde" />
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="block text-xl font-extrabold leading-tight">{c.nombre}</span>
                    <span className="block">
                      <Chip tono={c.ubicacion === "box" ? "neutro" : c.ubicacion === "fuera" ? "atencion" : "ok"}>
                        {UBICACIONES[c.ubicacion] ?? c.ubicacion} {desde}
                      </Chip>
                    </span>
                    <span className="block text-sm text-tinta-suave">
                      {[c.box && `Box ${c.box}`, c.pupilaje && PUPILAJES[c.pupilaje]].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-sm font-bold text-cuadra">
                    Ficha <Icono nombre="flecha" className="size-4" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </Seccion>

      {(cuidados ?? []).length > 0 && (
        <Seccion titulo="Próximos cuidados" id="cuidados">
          <ListaCuidados
            cuidados={cuidados ?? []}
            hoy={hoy}
            hipicaId={hipica.id}
            volver={base}
            modo="propietario"
            nombreCaballo={varios ? (id) => nombres.get(id) ?? null : undefined}
          />
          <p className="mt-3 text-sm text-tinta-suave">
            Si se encarga la hípica, se suma a tu recibo según su tarifa.
          </p>
        </Seccion>
      )}

      {(solicitudes ?? []).length > 0 && (
        <Seccion
          titulo="Servicios pedidos"
          id="pedidos"
          accion={
            <Link href={`${base}/servicios`} className="text-sm font-bold text-cuadra hover:underline">
              Pedir otro
            </Link>
          }
        >
          <ListaSolicitudes
            solicitudes={solicitudes ?? []}
            hipicaId={hipica.id}
            volver={base}
            modo="propietario"
            nombreCaballo={varios ? (id) => nombres.get(id) ?? null : undefined}
          />
        </Seccion>
      )}
    </>
  );
}
