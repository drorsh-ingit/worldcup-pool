"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Trophy, CalendarDays, Target } from "lucide-react";
import { cn } from "@/lib/utils";

interface GroupTabsProps {
  groupId: string;
}

export function GroupTabs({ groupId }: GroupTabsProps) {
  const pathname = usePathname();
  const base = `/group/${groupId}`;

  const tabs = [
    { href: base, label: "Standings", icon: Trophy, exact: true },
    { href: `${base}/matches`, label: "Matches", icon: CalendarDays },
    { href: `${base}/bets`, label: "Tournament", icon: Target },
  ];

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      {/* Desktop / tablet: horizontal pill tabs under header */}
      <div className="hidden sm:block">
        <div className="bg-white rounded-xl border border-neutral-200 p-1 inline-flex gap-1">
          {tabs.map((t) => {
            const active = isActive(t.href, t.exact);
            const Icon = t.icon;
            return (
              <Link
                key={t.href}
                href={t.href}
                className={cn(
                  "h-9 px-4 rounded-lg text-sm font-medium inline-flex items-center gap-2 transition-colors",
                  active
                    ? "bg-pitch-900 text-white"
                    : "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50"
                )}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Mobile: fixed bottom tab bar */}
      <nav
        className="sm:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-neutral-200"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="grid grid-cols-3">
          {tabs.map((t) => {
            const active = isActive(t.href, t.exact);
            const Icon = t.icon;
            return (
              <Link
                key={t.href}
                href={t.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 h-14 text-[11px] font-medium transition-colors",
                  active ? "text-pitch-700" : "text-neutral-500"
                )}
              >
                <Icon className={cn("w-5 h-5", active && "text-pitch-700")} />
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
