"use client";

import { useEffect } from "react";

/**
 * Unregisters any leftover service workers so demo traffic always hits
 * the network (avoids Serwist NetworkOnly / stale-cache noise).
 */
export function DisableServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    void navigator.serviceWorker.getRegistrations().then((regs) => {
      for (const reg of regs) {
        void reg.unregister();
      }
    });

    if ("caches" in window) {
      void caches.keys().then((keys) => {
        for (const key of keys) {
          void caches.delete(key);
        }
      });
    }
  }, []);

  return null;
}
