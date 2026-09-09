// Registers the service worker and reloads once when a new version takes over,
// so people always get fresh app-shell files without a stuck old cache.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((err) => {
      console.warn("Service worker registration failed:", err);
    });
  });

  // The very first time a service worker takes control of an uncontrolled page also
  // fires "controllerchange" — that's not an update, so it must not trigger a reload.
  // Only a *second* controllerchange (an old worker being swapped for a new one)
  // means there's actually a new version to pick up.
  let hadController = !!navigator.serviceWorker.controller;
  let refreshed = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController) {
      hadController = true;
      return;
    }
    if (refreshed) return;
    refreshed = true;
    window.location.reload();
  });
}
