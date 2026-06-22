"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { generateDailyAnalysis, type PersonaName } from "@/lib/actions/daily-analysis";

const PERSONA_OPTIONS: { value: PersonaName | ""; label: string }[] = [
  { value: "", label: "Auto (today's persona)" },
  { value: "cynical", label: "Cynical" },
  { value: "nice", label: "Extremely nice" },
  { value: "harsh", label: "Extremely harsh" },
  { value: "hillbilly", label: "Hillbilly conspiracist" },
];

export function GenerateAnalysisButton({
  groupId,
  tournamentId,
}: {
  groupId: string;
  tournamentId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [persona, setPersona] = useState<PersonaName | "">("");

  async function handle() {
    setLoading(true);
    setResult(null);
    const res = await generateDailyAnalysis(groupId, tournamentId, {
      force: true,
      persona: persona || undefined,
    });
    if ("error" in res) {
      setResult(`Error: ${res.error}`);
    } else {
      setResult(res.cached ? "Already generated today (cached)" : "Generated");
      router.refresh();
    }
    setLoading(false);
  }

  return (
    <div className="flex items-center" style={{ gap: 12 }}>
      <select
        value={persona}
        onChange={(e) => setPersona(e.target.value as PersonaName | "")}
        disabled={loading}
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
        onClick={handle}
        disabled={loading}
        className="h-8 rounded-lg border border-neutral-200 text-xs text-neutral-700 hover:bg-neutral-50 disabled:opacity-60 transition-colors flex items-center"
        style={{ paddingLeft: 12, paddingRight: 12, gap: 6 }}
      >
        <Sparkles className={`w-3.5 h-3.5 ${loading ? "animate-pulse" : ""}`} />
        {loading ? "Generating…" : "Generate daily analysis"}
      </button>
      {result && (
        <span className={`text-xs ${result.startsWith("Error") ? "text-red-500" : "text-emerald-600"}`}>
          {result}
        </span>
      )}
    </div>
  );
}
