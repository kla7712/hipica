"use client";

import { useEffect } from "react";
import { marcarAvisosLeidos } from "./actions";

// Al ver la lista, los avisos quedan leídos (la campana deja de marcar el número).
export function MarcarLeidos({ hipicaId, hay }: { hipicaId: string; hay: boolean }) {
  useEffect(() => {
    if (hay) marcarAvisosLeidos(hipicaId);
  }, [hipicaId, hay]);
  return null;
}
