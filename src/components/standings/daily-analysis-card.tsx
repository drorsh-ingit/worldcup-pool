import { Sparkles } from "lucide-react";

function formatDate(dateKey: string): string {
  // dateKey is YYYY-MM-DD
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("he-IL", {
    day: "numeric",
    month: "long",
  });
}

export function DailyAnalysisCard({ content, dateKey }: { content: string; dateKey: string }) {
  return (
    <div
      dir="rtl"
      className="rounded-2xl border border-amber-200 bg-amber-50/60 overflow-hidden"
      style={{ padding: "18px 20px" }}
    >
      <div className="flex items-center justify-between" style={{ gap: 12, marginBottom: 12 }}>
        <div className="inline-flex items-center" style={{ gap: 8 }}>
          <span className="inline-flex items-center justify-center rounded-xl bg-amber-100" style={{ width: 30, height: 30 }}>
            <Sparkles className="w-4 h-4 text-amber-600" />
          </span>
          <span className="text-sm font-semibold text-neutral-900">ניתוח יומי</span>
        </div>
        <span className="text-xs text-neutral-400 tabular-nums">{formatDate(dateKey)}</span>
      </div>
      <p
        className="text-sm text-neutral-700 whitespace-pre-wrap"
        style={{ lineHeight: 1.7 }}
      >
        {content}
      </p>
    </div>
  );
}
