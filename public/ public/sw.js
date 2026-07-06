// Service worker do Controle Financeiro — SOMENTE push.
// Sem handler de fetch e sem cache: este arquivo NÃO intercepta a rede,
// então nunca serve versão velha do app.
self.addEventListener("push", (e) => {
  e.waitUntil(
    self.registration.showNotification("Controle Financeiro", {
      body: "Você tem avisos para hoje — proventos a receber ou contas. Toque para abrir.",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: "cf-avisos",
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
