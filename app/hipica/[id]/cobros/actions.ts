"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { UUID } from "@/lib/rutas";

function ids(formData: FormData, ...campos: string[]) {
  const valores = campos.map((c) => String(formData.get(c) ?? ""));
  if (!valores.every((v) => UUID.test(v))) redirect("/");
  return valores;
}
const MES = /^\d{4}-\d{2}-01$/;
const texto = (formData: FormData, campo: string) => String(formData.get(campo) ?? "").trim();

// Solo admin (la base de datos lo comprueba en todas).

export async function generarRecibos(formData: FormData) {
  const [hipicaId] = ids(formData, "hipica_id");
  const mes = texto(formData, "mes");
  if (!MES.test(mes)) redirect("/");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("generar_recibos", { p_hipica: hipicaId, p_mes: mes });
  const aqui = `/hipica/${hipicaId}/cobros?mes=${mes.slice(0, 7)}`;
  if (error) {
    console.error("generar recibos:", error.message);
    redirect(`${aqui}&error=generar`);
  }
  redirect(`${aqui}&generados=${Number(data) || 0}`);
}

export async function crearCargo(formData: FormData) {
  const [hipicaId, clienteId] = ids(formData, "hipica_id", "cliente_id");
  const mes = texto(formData, "mes");
  const concepto = texto(formData, "concepto");
  const importe = Number(texto(formData, "importe").replace(",", "."));
  const aqui = `/hipica/${hipicaId}/cobros?mes=${mes.slice(0, 7)}`;
  if (!MES.test(mes) || concepto.length < 1 || concepto.length > 120 || !Number.isFinite(importe) || importe === 0 || Math.abs(importe) > 100000) {
    redirect(`${aqui}&error=cargo#cargos`);
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("cargos")
    .insert({ hipica_id: hipicaId, cliente_id: clienteId, mes, concepto, importe: Math.round(importe * 100) / 100, origen: "manual" });
  if (error) {
    console.error("crear cargo:", error.message);
    redirect(`${aqui}&error=cargo#cargos`);
  }
  redirect(`${aqui}&ok=cargo#cargos`);
}

export async function quitarCargo(formData: FormData) {
  const [, cargoId] = ids(formData, "hipica_id", "cargo_id");
  const supabase = await createClient();
  const { error } = await supabase.rpc("quitar_cargo", { p_cargo: cargoId });
  if (error) console.error("quitar cargo:", error.message);
  refresh();
}

export async function marcarRecibo(formData: FormData) {
  const [, reciboId] = ids(formData, "hipica_id", "recibo_id");
  const estado = texto(formData, "estado");
  const metodo = texto(formData, "metodo");
  const supabase = await createClient();
  const { error } = await supabase.rpc("marcar_recibo", { p_recibo: reciboId, p_estado: estado, p_metodo: metodo || null });
  if (error) console.error("marcar recibo:", error.message);
  refresh();
}
