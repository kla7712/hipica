// Excel (CSV) con los recibos de un mes, para la gestoría.
// Solo el administrador: la base de datos solo le devuelve datos a él.
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { UUID } from "@/lib/rutas";
import { METODOS, nombreMes } from "@/lib/hipica";

type Fila = {
  numero: number;
  total: number;
  estado: string;
  metodo: string | null;
  pagado_en: string | null;
  cliente: { nombre: string; telefono: string | null; datos_factura: string | null } | null;
  cargos: { concepto: string; importe: number }[];
};

// Celda segura para Excel: entre comillas y sin fórmulas (=, +, -, @ al principio).
const celda = (v: unknown) => {
  let t = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return `"${t.replace(/"/g, '""')}"`;
};
const numero = (n: number) => Number(n).toFixed(2).replace(".", ",");

export async function GET(request: NextRequest, { params }: RouteContext<"/hipica/[id]/cobros/exportar">) {
  const { id } = await params;
  const mesQ = request.nextUrl.searchParams.get("mes") ?? "";
  if (!UUID.test(id) || !/^\d{4}-\d{2}$/.test(mesQ)) return new NextResponse("Petición no válida", { status: 400 });
  const mes = `${mesQ}-01`;

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return new NextResponse("Hay que iniciar sesión", { status: 401 });
  const { data: esAdmin } = await supabase.rpc("es_admin", { p_hipica: id });
  if (!esAdmin) return new NextResponse("Solo el administrador", { status: 403 });

  const { data, error } = await supabase
    .from("recibos")
    .select("numero, total, estado, metodo, pagado_en, cliente:miembros(nombre, telefono, datos_factura), cargos(concepto, importe)")
    .eq("hipica_id", id)
    .eq("mes", mes)
    .order("numero")
    .returns<Fila[]>();
  if (error) return new NextResponse("No se ha podido exportar", { status: 500 });

  const cabecera = ["Nº recibo", "Cliente", "Datos de factura", "Teléfono", "Concepto", "Importe", "Total recibo", "Estado", "Forma de pago", "Fecha de pago"];
  const lineas = [cabecera.map(celda).join(";")];
  for (const r of data ?? []) {
    for (const c of r.cargos) {
      lineas.push(
        [
          celda(r.numero),
          celda(r.cliente?.nombre),
          celda(r.cliente?.datos_factura),
          celda(r.cliente?.telefono),
          celda(c.concepto),
          numero(c.importe),
          numero(r.total),
          celda(r.estado),
          celda(r.metodo ? METODOS[r.metodo] : ""),
          celda(r.pagado_en ?? ""),
        ].join(";"),
      );
    }
  }
  const csv = "﻿" + lineas.join("\r\n") + "\r\n";
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="recibos-${nombreMes(mes)}-${mesQ.slice(0, 4)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
