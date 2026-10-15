// Solo acepta rutas internas ("/algo"), nunca otra web ("//otra.com", "https://…").
export function rutaSegura(valor: unknown, porDefecto = "/") {
  if (typeof valor !== "string") return porDefecto;
  if (!valor.startsWith("/") || valor.startsWith("//") || valor.includes("\\")) return porDefecto;
  return valor;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
