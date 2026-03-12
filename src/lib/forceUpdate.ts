/**
 * Unregisters all Service Workers, clears all caches, and hard-reloads the page.
 * This guarantees the browser fetches the latest build from the server.
 */
export async function forceUpdate(): Promise<void> {
  try {
    // 1. Unregister all service workers
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((r) => r.unregister()));
    }

    // 2. Clear all caches (Workbox runtime caches, precache, fonts, etc.)
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    // Ignore errors – worst case we just do a normal reload
  }

  // 3. Hard reload bypassing disk cache
  window.location.reload();
}
