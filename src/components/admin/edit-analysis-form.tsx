"use client";

import { useState } from "react";
import { updateAnalysisContent } from "@/lib/actions/daily-analysis";

export function EditAnalysisForm({ id, initialContent }: { id: string; initialContent: string }) {
  const [content, setContent] = useState(initialContent);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handle() {
    setLoading(true);
    setResult(null);
    const res = await updateAnalysisContent(id, content);
    setResult("error" in res ? `Error: ${res.error}` : "Saved");
    setLoading(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <textarea
        dir="rtl"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={6}
        className="w-full rounded-lg border border-neutral-200 text-sm text-neutral-700 resize-y focus:outline-none focus:ring-2 focus:ring-amber-400"
        style={{ padding: "10px 12px", lineHeight: 1.7, fontFamily: "inherit" }}
      />
      <div className="flex items-center" style={{ gap: 12 }}>
        <button
          onClick={handle}
          disabled={loading || content === initialContent}
          className="h-8 rounded-lg border border-neutral-200 text-xs text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 transition-colors flex items-center"
          style={{ paddingLeft: 12, paddingRight: 12 }}
        >
          {loading ? "Saving…" : "Save"}
        </button>
        {result && (
          <span className={`text-xs ${result.startsWith("Error") ? "text-red-500" : "text-emerald-600"}`}>
            {result}
          </span>
        )}
      </div>
    </div>
  );
}
