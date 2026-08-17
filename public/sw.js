/**
 * Service worker mínimo, solo para notificaciones push (no cachea nada de la
 * app: cada carga sigue pidiendo lo último al servidor como siempre).
 */

self.addEventListener("push", (event) => {
  let datos = { titulo: "Admira Trace", mensaje: "Tienes una notificación nueva." };
  try {
    if (event.data) datos = event.data.json();
  } catch {
    // Si por lo que sea no viene como JSON, se usa el texto tal cual.
    if (event.data) datos.mensaje = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(datos.titulo || "Admira Trace", {
      body: datos.mensaje || "",
      data: { url: datos.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
