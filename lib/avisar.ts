// Tras una acción que puede dejar avisos (cancelar una clase, generar recibos…),
// los manda al momento, después de responder a quien la hizo (no le hace esperar).
import { after } from "next/server";
import { enviarAvisos } from "@/lib/avisos-envio";

export function avisar() {
  after(async () => {
    try {
      await enviarAvisos();
    } catch (e) {
      console.error("enviar avisos:", (e as Error).message);
    }
  });
}
