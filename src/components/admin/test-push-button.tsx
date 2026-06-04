"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import { sendTestPush } from "@/lib/actions/push";

export function TestPushButton({ groupId }: { groupId: string }) {
  const [state, setState] = useState<"idle" | "sending" | "ok" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function handleClick() {
    setState("sending");
    setMsg("");
    const result = await sendTestPush(groupId);
    if (result.error) {
      setState("error");
      setMsg(result.error);
    } else {
      setState("ok");
      setMsg(`Sent to ${result.sent} subscriber${result.sent !== 1 ? "s" : ""}`);
    }
  }

  return (
    <div className="flex items-center" style={{ gap: 12 }}>
      <button
        onClick={handleClick}
        disabled={state === "sending"}
        className="inline-flex items-center h-9 rounded-xl border border-neutral-200 text-sm font-medium text-neutral-700 bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        style={{ gap: 8, paddingLeft: 14, paddingRight: 14 }}
      >
        <Bell className="w-4 h-4 text-neutral-400" />
        {state === "sending" ? "Sending…" : "Send test notification"}
      </button>
      {msg && (
        <span className={`text-xs font-medium ${state === "ok" ? "text-emerald-600" : "text-red-500"}`}>
          {msg}
        </span>
      )}
    </div>
  );
}
