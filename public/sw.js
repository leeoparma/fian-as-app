// Service worker do Controle Financeiro — SOMENTE push.
// Sem handler de fetch e sem cache: este arquivo NÃO intercepta a rede,
// então nunca serve versão velha do app.
// Versão nova assume IMEDIATAMENTE (sem isto, a atualização fica "waiting"
// para sempre no iOS e os pushes continuam indo para o SW antigo)
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(clients.claim()));

self.addEventListener("push", (e) => {
  let title = "🔔 Avisos de hoje"; // o iOS já anexa "from Finanças" — não repetir a marca
  let body = "Você tem avisos para hoje — proventos a receber ou contas. Toque para abrir.";
  let tag = "cf-avisos";
  try {
    if (e.data) {
      const d = e.data.json();
      if (d && d.title) title = d.title;
      if (d && d.body) body = d.body;
      if (d && d.tag) tag = d.tag;
    }
  } catch {}
  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag,
    })
  );
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((ws) => {
      for (const w of ws) { if ("focus" in w) return w.focus(); }
      return clients.openWindow("/");
    })
  );
});
