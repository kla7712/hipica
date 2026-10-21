// Tipos de lo que devuelven las funciones de la base de datos.

export type MiaReserva = {
  reserva: string;
  miembro: string;
  nombre: string;
  caballo: string | null;
  desde_espera: boolean;
};

export type MiaEspera = { espera: string; miembro: string; nombre: string; puesto: number };

// Fila de horario()
export type SesionHorario = {
  id: string;
  titulo: string;
  nivel: string | null;
  tipo: "grupo" | "particular" | "libre";
  pista: string | null;
  inicio: string;
  fin: string;
  plazas: number;
  ocupadas: number;
  en_espera: number;
  cancelada: boolean;
  monitor: string | null;
  mias: MiaReserva[];
  esperas: MiaEspera[];
};

// Fila de estado_bonos()
export type EstadoBono = {
  miembro_id: string;
  nombre: string;
  nivel: string | null;
  titular_id: string | null;
  con_cuenta: boolean;
  bono_id: string | null;
  clases: number | null;
  usadas: number | null;
  caduca: string | null;
};

export type Tono = "ok" | "atencion" | "info" | "neutro" | "alerta";

// Cómo va el bono de alguien, en pocas palabras.
export function resumenBono(b: Pick<EstadoBono, "bono_id" | "clases" | "usadas" | "caduca">, hoy: string) {
  if (!b.bono_id || b.clases == null) return { texto: "Sin bono", tono: "neutro" as Tono, quedan: 0, renovar: false };
  const quedan = b.clases - (b.usadas ?? 0);
  if (b.caduca && b.caduca < hoy) return { texto: "Bono caducado", tono: "alerta" as Tono, quedan: 0, renovar: true };
  if (quedan <= 0) return { texto: "Bono agotado", tono: "atencion" as Tono, quedan: 0, renovar: true };
  if (quedan === 1) return { texto: "Queda 1 clase", tono: "atencion" as Tono, quedan, renovar: true };
  return { texto: `Quedan ${quedan} de ${b.clases}`, tono: "ok" as Tono, quedan, renovar: false };
}
