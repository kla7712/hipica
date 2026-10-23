// Service worker de la app: recibe las notificaciones y abre la pantalla de cada aviso.
// No guarda nada en caché: la app siempre necesita conexión.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Solo rutas de la propia app ("/hipica/…"), nunca otra web.
const rutaSegura = (url) => (typeof url === "string" && /^\/(?!\/)/.test(url) ? url : "/");

self.addEventListener("push", (event) => {
  let datos = {};
  try {
    datos = event.data ? event.data.json() : {};
  } catch {
    datos = { texto: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(datos.titulo || "Tu hípica", {
      body: datos.texto || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: datos.id || undefined,
      lang: "es",
      data: { url: rutaSegura(datos.url) },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = new URL(rutaSegura(event.notification.data && event.notification.data.url), self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ventanas) => {
      for (const v of ventanas) {
        if (v.url.startsWith(self.location.origin) && "focus" in v) {
          return v.navigate(destino).then((w) => (w || v).focus());
        }
      }
      return self.clients.openWindow(destino);
    }),
  );
});
