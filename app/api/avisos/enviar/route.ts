// Lo llama Vercel una vez al día (vercel.json) con "Authorization: Bearer CRON_SECRET".
// Crea los recordatorios del día y manda lo que quede pendiente.
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { crearRecordatorios, enviarAvisos, secretoValido } from "@/lib/avisos-envio";

function autorizado(request: NextRequest) {
  const secreto = secretoValido();
  const recibido = request.headers.get("authorization") ?? "";
  if (!secreto) return false;
  const a = Buffer.from(recibido);
  const b = Buffer.from(`Bearer ${secreto}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function ejecutar(request: NextRequest) {
  if (!autorizado(request)) return new NextResponse("No autorizado", { status: 401 });
  const recordatorios = request.nextUrl.searchParams.get("recordatorios") === "1" ? await crearRecordatorios() : 0;
  const enviados = await enviarAvisos();
  return NextResponse.json({ recordatorios, ...enviados }, { headers: { "Cache-Control": "no-store" } });
}

export const GET = ejecutar;
export const POST = ejecutar;
