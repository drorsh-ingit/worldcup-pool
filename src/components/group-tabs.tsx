"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Trophy, CalendarDays, Target, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

interface GroupTabsProps {
  groupId: string;
  isAdmin?: boolean;
  pendingBets?: { matches: number; tournament: number };
}

export function GroupTabs({ groupId, isAdmin, pendingBets }: GroupTabsProps) {
  const pathname = usePathname();
  const base = `/group/${groupId}`;

  const tabs = [
    { href: base, label: "Standings", icon: Trophy, exact: true, pending: 0 },
    { href: `${base}/matches`, label: "Matches", icon: CalendarDays, pending: pendingBets?.matches ?? 0 },
    { href: `${base}/bets`, label: "Tournament", icon: Target, pending: pendingBets?.tournament ?? 0 },
    ...(isAdmin ? [{ href: `${base}/admin`, label: "Admin", icon: Settings, exact: false, pending: 0 }] : []),
  ];

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      {/* Desktop / tablet: unified header tab row */}
      <div className="hidden sm:flex gap-8">
        {tabs.map((t) => {
          const active = isActive(t.href, t.exact);
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "h-14 px-5 text-sm inline-flex items-center gap-2 border-b-2 transition-colors relative",
                active
                  ? "border-emerald-600 text-neutral-900 font-semibold"
                  : "border-transparent text-neutral-500 hover:text-neutral-800 font-medium"
              )}
            >
              <Icon className={cn("w-4 h-4", active ? "text-emerald-600" : "text-neutral-400")} />
              {t.label}
              {t.pending > 0 && (
                <span
                  className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-amber-500 text-white text-xs font-semibold leading-none"
                  title={`${t.pending} bet${t.pending === 1 ? "" : "s"} to enter`}
                >
                  {t.pending}
                </span>
              )}
            </Link>
          );
        })}
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
                  "flex flex-col items-center justify-center gap-1 h-16 text-[11px] font-medium transition-colors relative",
                  active ? "text-emerald-700" : "text-neutral-500"
                )}
              >
                <span className="relative">
                  <Icon className={cn("w-5 h-5", active ? "text-emerald-600" : "text-neutral-400")} />
                  {t.pending > 0 && (
                    <span className="absolute -top-1.5 -right-3 inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold leading-none">
                      {t.pending}
                    </span>
                  )}
                </span>
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
