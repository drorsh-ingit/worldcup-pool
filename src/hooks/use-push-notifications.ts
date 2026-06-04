"use client";

import { useState, useEffect } from "react";

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const bytes = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) bytes[i] = rawData.charCodeAt(i);
  return bytes.buffer;
}

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);

    // Register SW and check if already subscribed
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(!!sub))
      .catch(() => {});
  }, []);

  async function subscribe() {
    setDebugInfo(null);
    if (!("serviceWorker" in navigator)) {
      setDebugInfo("No service worker support");
      return;
    }
    if (!("Notification" in window)) {
      setDebugInfo("No Notification API");
      return;
    }
    if (!("PushManager" in window)) {
      setDebugInfo("No PushManager — requires iOS 16.4+ PWA");
      return;
    }
    setLoading(true);
    try {
      setDebugInfo("Requesting permission...");
      const perm = await Notification.requestPermission();
      setPermission(perm);
      setDebugInfo(`Permission: ${perm}`);
      if (perm !== "granted") return;

      const vapidKey = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "").trim().replace(/\s/g, "");
      if (!vapidKey) {
        setDebugInfo("Error: VAPID key not configured");
        return;
      }
      setDebugInfo("Waiting for SW...");
      const reg = await navigator.serviceWorker.ready;
      setDebugInfo("Subscribing to push...");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      setDebugInfo("Saving subscription...");
      const json = sub.toJSON();
      const res = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      if (!res.ok) {
        setDebugInfo(`Server error: ${res.status}`);
        return;
      }
      setSubscribed(true);
      setDebugInfo(null);
    } catch (err) {
      setDebugInfo(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  async function unsubscribe() {
    if (!("serviceWorker" in navigator)) return;
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } finally {
      setLoading(false);
    }
  }

  return { permission, subscribed, loading, subscribe, unsubscribe, debugInfo };
}
