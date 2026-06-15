import { Target, CheckCircle2, XCircle } from "lucide-react";
import type { UserSummary } from "@/lib/group-stats";

export function StatsSummary({ summary }: { summary: UserSummary }) {
  const cards = [
    {
      label: "Correct scores",
      value: summary.exact,
      icon: Target,
      cls: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      label: "Correct winners",
      value: summary.winner,
      icon: CheckCircle2,
      cls: "text-amber-600",
      bg: "bg-amber-50",
    },
    {
      label: "Wrong",
      value: summary.wrong,
      icon: XCircle,
      cls: "text-red-500",
      bg: "bg-red-50",
    },
  ];

  return (
    <div className="grid grid-cols-3" style={{ gap: 12 }}>
      {cards.map(({ label, value, icon: Icon, cls, bg }) => (
        <div
          key={label}
          className="rounded-2xl border border-neutral-200 bg-white flex flex-col items-center text-center"
          style={{ padding: "18px 12px", gap: 8 }}
        >
          <div className={`inline-flex items-center justify-center rounded-xl ${bg}`} style={{ width: 36, height: 36 }}>
            <Icon className={`w-4 h-4 ${cls}`} />
          </div>
          <span className="text-3xl font-black tabular-nums text-neutral-900 leading-none">{value}</span>
          <span className="text-xs font-medium text-neutral-500 leading-tight">{label}</span>
        </div>
      ))}
    </div>
  );
}
