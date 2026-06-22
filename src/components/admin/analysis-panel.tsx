"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import {
  previewDailyAnalysis,
  saveDailyAnalysis,
  updateAnalysisContent,
  type PersonaName,
  type SnapshotRow,
} from "@/lib/actions/daily-analysis";

const PERSONA_OPTIONS: { value: PersonaName | ""; label: string }[] = [
  { value: "", label: "Auto (today's persona)" },
  { value: "cynical", label: "Cynical" },
  { value: "nice", label: "Extremely nice" },
  { value: "harsh", label: "Extremely harsh" },
  { value: "hillbilly", label: "Hillbilly conspiracist" },
];

export function AnalysisPanel({
  groupId,
  tournamentId,
  latest,
}: {
  groupId: string;
  tournamentId: string;
  latest: { id: string; content: string } | null;
}) {
  const router = useRouter();
  const [persona, setPersona] = useState<PersonaName | "">("");
  const [content, setContent] = useState(latest?.content ?? "");
  // Set after a fresh preview; carries the standings baseline to save alongside.
  const [pendingSnapshot, setPendingSnapshot] = useState<SnapshotRow[] | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleGenerate() {
    setGenerating(true);
    setResult(null);
    const res = await previewDailyAnalysis(groupId, tournamentId, { persona: persona || undefined });
    if ("error" in res) {
      setResult(`Error: ${res.error}`);
    } else {
      setContent(res.content);
      setPendingSnapshot(res.snapshot);
      setResult("Preview ready — not saved yet. Click Save to publish.");
    }
    setGenerating(false);
  }

  async function handleSave() {
    setSaving(true);
    setResult(null);
    const res = pendingSnapshot
      ? await saveDailyAnalysis(groupId, tournamentId, content, pendingSnapshot)
      : latest
        ? await updateAnalysisContent(latest.id, content)
        : { error: "Nothing to save" };
    if ("error" in res) {
      setResult(`Error: ${res.error}`);
    } else {
      setResult("Saved");
      setPendingSnapshot(null);
      router.refresh();
    }
    setSaving(false);
  }

  const busy = generating || saving;
  const dirty = pendingSnapshot != null || content !== (latest?.content ?? "");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="flex items-center" style={{ gap: 12 }}>
        <select
          value={persona}
          onChange={(e) => setPersona(e.target.value as PersonaName | "")}
          disabled={busy}
          className="h-8 rounded-lg border border-neutral-200 text-xs text-neutral-700 disabled:opacity-60"
          style={{ paddingLeft: 8, paddingRight: 8 }}
        >
          {PERSONA_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <button
          onClick={handleGenerate}
          disabled={busy}
          className="h-8 rounded-lg border border-neutral-200 text-xs text-neutral-700 hover:bg-neutral-50 disabled:opacity-60 transition-colors flex items-center"
          style={{ paddingLeft: 12, paddingRight: 12, gap: 6 }}
        >
          <Sparkles className={`w-3.5 h-3.5 ${generating ? "animate-pulse" : ""}`} />
          {generating ? "Generating…" : "Generate daily analysis"}
        </button>
      </div>

      <textarea
        dir="rtl"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={6}
        placeholder="Generate a draft above, or write one here. Nothing is published until you click Save."
        className="w-full rounded-lg border border-neutral-200 text-sm text-neutral-700 resize-y focus:outline-none focus:ring-2 focus:ring-amber-400"
        style={{ padding: "10px 12px", lineHeight: 1.7, fontFamily: "inherit" }}
      />

      <div className="flex items-center" style={{ gap: 12 }}>
        <button
          onClick={handleSave}
          disabled={busy || !dirty || !content.trim()}
          className="h-8 rounded-lg border border-neutral-200 text-xs text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 transition-colors flex items-center"
          style={{ paddingLeft: 12, paddingRight: 12 }}
        >
          {saving ? "Saving…" : "Save"}
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
