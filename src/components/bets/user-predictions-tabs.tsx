"use client";

import { useState, type ReactNode } from "react";
import { Target, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

interface UserPredictionsTabsProps {
  tournamentTab: ReactNode;
  matchesTab: ReactNode;
  hasTournament: boolean;
  hasMatches: boolean;
  matchesCount?: number;
  tournamentCount?: number;
}

export function UserPredictionsTabs({
  tournamentTab,
  matchesTab,
  hasTournament,
  hasMatches,
  matchesCount,
  tournamentCount,
}: UserPredictionsTabsProps) {
  const [active, setActive] = useState<"tournament" | "matches">(
    hasMatches ? "matches" : "tournament"
  );

  const tabs = [
    { id: "tournament" as const, label: "Tournament", icon: Target, count: tournamentCount, enabled: hasTournament },
    { id: "matches" as const, label: "Matches", icon: CalendarDays, count: matchesCount, enabled: hasMatches },
  ].filter((t) => t.enabled);

  if (tabs.length <= 1) {
    return <>{active === "tournament" ? tournamentTab : matchesTab}</>;
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex gap-2 border-b border-neutral-200">
        {tabs.map((t) => {
          const isActive = active === t.id;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActive(t.id)}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-3 text-sm border-b-2 -mb-px transition-colors",
                isActive
                  ? "border-emerald-600 text-neutral-900 font-semibold"
                  : "border-transparent text-neutral-500 hover:text-neutral-800 font-medium"
              )}
            >
              <Icon className={cn("w-4 h-4", isActive ? "text-emerald-600" : "text-neutral-400")} />
              {t.label}
              {t.count != null && (
                <span className={cn(
                  "text-xs tabular-nums rounded-full px-2 py-0.5",
                  isActive ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-500"
                )}>
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div>{active === "tournament" ? tournamentTab : matchesTab}</div>
    </div>
  );
}
