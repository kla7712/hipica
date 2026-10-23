"use server";

import { createClient } from "@/lib/supabase/server";
import { UUID } from "@/lib/rutas";

// Al abrir la lista de avisos, se dan por leídos.
export async function marcarAvisosLeidos(hipicaId: string): Promise<void> {
  if (typeof hipicaId !== "string" || !UUID.test(hipicaId)) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("marcar_avisos_leidos", { p_hipica: hipicaId });
  if (error) console.error("marcar_avisos_leidos:", error.message);
}
