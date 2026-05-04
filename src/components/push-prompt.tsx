"use client";

import { Bell, X } from "lucide-react";
import { useState } from "react";
import { usePushNotifications } from "@/hooks/use-push-notifications";

export function PushPrompt() {
  const { permission, subscribed, loading, subscribe } = usePushNotifications();
  const [dismissed, setDismissed] = useState(false);

  // Don't show if: unsupported, already granted/denied, subscribed, or dismissed
  if (
    dismissed ||
    subscribed ||
    permission === "unsupported" ||
    permission === "granted" ||
    permission === "denied"
  ) {
    return null;
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-50 border-b border-amber-100 text-sm">
      <Bell className="w-4 h-4 text-amber-500 shrink-0" />
      <span className="flex-1 text-neutral-700">
        Get notified when new predictions open
      </span>
      <button
        onClick={subscribe}
        disabled={loading}
        className="px-3 py-1 rounded-full bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 transition-colors disabled:opacity-50"
      >
        {loading ? "…" : "Enable"}
      </button>
      <button
        onClick={() => setDismissed(true)}
        className="text-neutral-400 hover:text-neutral-600 transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
