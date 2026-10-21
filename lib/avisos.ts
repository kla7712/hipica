// Textos de los avisos que llegan por la URL (?aviso=codigo).
export const AVISOS: Record<string, string> = {
  completa: "No quedan plazas en esa clase. Puedes apuntarte a la lista de espera.",
  repetida: "Ya tiene plaza en esa clase.",
  cancelada: "Esa clase está cancelada.",
  empezada: "Esa clase ya ha empezado.",
  plazo: "Ya no se puede anular: ha pasado el plazo. Habla con la hípica.",
  ajena: "No puedes anular esa reserva.",
  persona: "No puedes reservar para esa persona.",
  bono: "No quedan clases en el bono. Pide uno nuevo en la hípica.",
  quedan: "Aún quedan plazas: reserva directamente.",
  yaespera: "Ya está en la lista de espera.",
  esperallena: "La lista de espera está llena.",
  texto: "Escribe el aviso (máximo 1000 caracteres).",
  error: "Algo ha fallado. Vuelve a intentarlo.",
};

export function textoAviso(codigo: unknown) {
  return typeof codigo === "string" && Object.hasOwn(AVISOS, codigo) ? AVISOS[codigo] : null;
}
