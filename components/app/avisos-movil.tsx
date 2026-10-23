"use client";

// Notificaciones en este móvil (Web Push) e instalación de la app.
// En iPhone, las notificaciones solo funcionan con la app añadida a la pantalla de inicio.
import { useEffect, useState } from "react";
import { borrarSuscripcion, guardarSuscripcion } from "@/app/cuenta/actions";
import { Icono, boton, botonSecundario, botonTexto, tarjeta } from "@/components/app/ui";

type Estado = "cargando" | "sin-config" | "no-soportado" | "ios-instalar" | "denegado" | "inactivo" | "activo" | "error";

const CLAVE = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function claveBinaria(base64: string) {
  const relleno = "=".repeat((4 - (base64.length % 4)) % 4);
  const b = atob((base64 + relleno).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

function esIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function instalada() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

async function comprobar(): Promise<Estado> {
  if (!CLAVE) return "sin-config";
  if (!("serviceWorker" in navigator)) return "no-soportado";
  if (!("PushManager" in window) || !("Notification" in window)) return esIOS() && !instalada() ? "ios-instalar" : "no-soportado";
  if (Notification.permission === "denied") return "denegado";
  const reg = await navigator.serviceWorker.register("/sw.js");
  const sus = await reg.pushManager.getSubscription();
  return sus ? "activo" : "inactivo";
}

function useEstadoAvisos() {
  const [estado, setEstado] = useState<Estado>("cargando");
  useEffect(() => {
    let vivo = true;
    comprobar()
      .catch(() => "no-soportado" as Estado)
      .then((e) => vivo && setEstado(e));
    return () => {
      vivo = false;
    };
  }, []);
  return [estado, setEstado] as const;
}

async function activar(): Promise<Estado> {
  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") return permiso === "denied" ? "denegado" : "inactivo";
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const sus =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveBinaria(CLAVE!) }));
  const j = sus.toJSON();
  const ok = await guardarSuscripcion({ endpoint: sus.endpoint, p256dh: j.keys?.p256dh ?? "", auth: j.keys?.auth ?? "" });
  if (!ok) {
    await sus.unsubscribe();
    return "error";
  }
  return "activo";
}

async function desactivar(): Promise<Estado> {
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  const sus = await reg?.pushManager.getSubscription();
  if (sus) {
    await borrarSuscripcion(sus.endpoint);
    await sus.unsubscribe();
  }
  return "inactivo";
}

const TEXTOS: Partial<Record<Estado, string>> = {
  "no-soportado": "Este navegador no puede recibir notificaciones. Te llegarán por email y las verás en la campana.",
  "ios-instalar":
    "En iPhone, primero añade la app a la pantalla de inicio: toca Compartir y luego «Añadir a pantalla de inicio». Ábrela desde ese icono y activa aquí los avisos.",
  denegado: "Has bloqueado las notificaciones de esta web. Para activarlas, permítelas en los ajustes del navegador.",
  error: "No se han podido activar. Vuelve a probar en un momento.",
};

// Bloque completo para Mi cuenta.
export function AvisosMovil({ demo = false }: { demo?: boolean }) {
  const [estado, setEstado] = useEstadoAvisos();
  const [ocupado, setOcupado] = useState(false);
  const pulsar = (accion: () => Promise<Estado>) => async () => {
    setOcupado(true);
    setEstado(await accion().catch(() => "error" as Estado));
    setOcupado(false);
  };

  if (estado === "cargando" || estado === "sin-config") return null;
  return (
    <div className={`${tarjeta} space-y-3 p-4`}>
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-alfalfa-suave text-cuadra">
          <Icono nombre="campana" className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">Notificaciones en este móvil</p>
          <p className="text-sm text-tinta-suave">
            {estado === "activo"
              ? "Activadas. Te avisaremos aquí de cancelaciones, plazas libres, recibos y lo que te toque."
              : (TEXTOS[estado] ?? "Recibe al momento las cancelaciones, las plazas libres y lo que te toque decidir.")}
          </p>
          {demo && <p className="mt-1 text-sm font-semibold text-atencion">En la demo los avisos se ven en la campana, pero no llegan al móvil.</p>}
        </div>
      </div>
      {estado === "inactivo" && (
        <button type="button" onClick={pulsar(activar)} disabled={ocupado} className={`${boton} w-full`}>
          Activar notificaciones
        </button>
      )}
      {estado === "error" && (
        <button type="button" onClick={pulsar(activar)} disabled={ocupado} className={`${botonSecundario} w-full`}>
          Volver a probar
        </button>
      )}
      {estado === "activo" && (
        <button type="button" onClick={pulsar(desactivar)} disabled={ocupado} className={botonTexto}>
          Desactivar en este móvil
        </button>
      )}
    </div>
  );
}

// Tarjeta corta para Inicio / Hoy: solo aparece si aún no están activadas.
export function InvitarAvisos() {
  const [estado, setEstado] = useEstadoAvisos();
  const [oculta, setOculta] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vivo = true;
    Promise.resolve()
      .then(() => {
        try {
          return localStorage.getItem("avisos-tarjeta") === "no";
        } catch {
          return false;
        }
      })
      .then((no) => vivo && no && setOculta(true));
    return () => {
      vivo = false;
    };
  }, []);

  if (oculta || (estado !== "inactivo" && estado !== "ios-instalar")) return null;
  const cerrar = () => {
    setOculta(true);
    try {
      localStorage.setItem("avisos-tarjeta", "no");
    } catch {
      /* sin almacenamiento: solo se oculta ahora */
    }
  };
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-alfalfa-suave p-4">
      <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-cuadra text-alfalfa">
        <Icono nombre="campana" className="size-5" />
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="font-bold leading-snug">Entérate al momento</p>
        <p className="text-sm text-tinta-suave">
          {estado === "ios-instalar"
            ? "Añade la app a la pantalla de inicio (Compartir → «Añadir a pantalla de inicio») y activa los avisos desde Mi cuenta."
            : "Activa las notificaciones y te avisamos de cancelaciones, plazas libres y recibos."}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {estado === "inactivo" && (
            <button
              type="button"
              disabled={ocupado}
              onClick={async () => {
                setOcupado(true);
                setEstado(await activar().catch(() => "error" as Estado));
                setOcupado(false);
              }}
              className={boton}
            >
              Activar
            </button>
          )}
          <button type="button" onClick={cerrar} className={botonTexto}>
            Ahora no
          </button>
        </div>
      </div>
    </div>
  );
}

// Botón "Instalar la app" (Android y ordenador con Chrome/Edge). En iPhone se explica a mano.
type EventoInstalar = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function InstalarApp() {
  const [evento, setEvento] = useState<EventoInstalar | null>(null);
  const [modo, setModo] = useState<"nada" | "ios" | "instalada">("nada");

  useEffect(() => {
    const guardar = (e: Event) => {
      e.preventDefault();
      setEvento(e as EventoInstalar);
    };
    const hecha = () => {
      setEvento(null);
      setModo("instalada");
    };
    window.addEventListener("beforeinstallprompt", guardar);
    window.addEventListener("appinstalled", hecha);
    let vivo = true;
    Promise.resolve()
      .then(() => (instalada() ? "instalada" : esIOS() ? "ios" : "nada"))
      .then((m) => vivo && setModo(m));
    return () => {
      vivo = false;
      window.removeEventListener("beforeinstallprompt", guardar);
      window.removeEventListener("appinstalled", hecha);
    };
  }, []);

  if (modo === "instalada" || (!evento && modo !== "ios")) return null;
  return (
    <div className={`${tarjeta} flex items-start gap-3 p-4`}>
      <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-cuadra text-alfalfa">
        <Icono nombre="herradura" className="size-5" />
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="font-bold">Tenla como una app</p>
        <p className="text-sm text-tinta-suave">
          {evento
            ? "Con su icono en la pantalla de inicio, se abre a pantalla completa."
            : "En iPhone: toca Compartir y luego «Añadir a pantalla de inicio»."}
        </p>
        {evento && (
          <button
            type="button"
            className={boton}
            onClick={async () => {
              await evento.prompt();
              await evento.userChoice;
              setEvento(null);
            }}
          >
            Instalar la app
          </button>
        )}
      </div>
    </div>
  );
}
