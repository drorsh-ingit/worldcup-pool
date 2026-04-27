"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Trophy, CalendarDays, Target, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

interface GroupTabsProps {
  groupId: string;
  isAdmin?: boolean;
}

export function GroupTabs({ groupId, isAdmin }: GroupTabsProps) {
  const pathname = usePathname();
  const base = `/group/${groupId}`;

  const tabs = [
    { href: base, label: "Standings", icon: Trophy, exact: true },
    { href: `${base}/matches`, label: "Matches", icon: CalendarDays },
    { href: `${base}/bets`, label: "Tournament", icon: Target },
    ...(isAdmin ? [{ href: `${base}/admin`, label: "Admin", icon: Settings, exact: false }] : []),
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
                "h-14 px-5 text-sm inline-flex items-center gap-2 border-b-2 transition-colors",
                active
                  ? "border-emerald-600 text-neutral-900 font-semibold"
                  : "border-transparent text-neutral-500 hover:text-neutral-800 font-medium"
              )}
            >
              <Icon className={cn("w-4 h-4", active ? "text-emerald-600" : "text-neutral-400")} />
              {t.label}
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
                  "flex flex-col items-center justify-center gap-1 h-14 text-[11px] font-medium transition-colors",
                  active ? "text-emerald-700" : "text-neutral-500"
                )}
              >
                <Icon className={cn("w-5 h-5", active ? "text-emerald-600" : "text-neutral-400")} />
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
