"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useState, useRef, useEffect } from "react";
import { LogOut, ChevronDown, Check, Plus, Trophy, CalendarDays, BarChart2, Settings, UserPen, type LucideProps } from "lucide-react";

const ICON_MAP: Record<string, React.ComponentType<LucideProps>> = {
  Trophy, CalendarDays, BarChart2, Settings,
};
import { MatchdayLogo } from "@/components/matchday-logo";
import { useNavMeta } from "@/lib/nav-tabs-context";
import { getInitials, getAvatarColor, AVATAR_COLOR_OPTIONS } from "@/lib/avatar";
import { cn } from "@/lib/utils";

interface GroupOption {
  id: string;
  name: string;
}

interface AppNavProps {
  user: { name: string; email: string; avatarColor?: number | null; avatarEmoji?: string | null };
  groups: GroupOption[];
}

function AppNavInner({ user, groups }: AppNavProps) {
  const params = useParams<{ groupId?: string }>();
  const pathname = usePathname();
  const currentGroupId = params?.groupId;
  const currentGroup = groups.find((g) => g.id === currentGroupId);
  const { tabs, tournamentLogo, tournamentName } = useNavMeta();

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (userRef.current && !userRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const userInitials = getInitials(user.name ?? "");
  const userAvatarColor = user.avatarColor != null
    ? AVATAR_COLOR_OPTIONS[user.avatarColor]
    : getAvatarColor(user.email ?? user.name ?? "");
  const userAvatarEmoji = user.avatarEmoji ?? null;

  return (
    <header className="sticky top-0 z-30 bg-neutral-50 border-b border-neutral-200 shadow-sm">

      <div className="max-w-screen-2xl mx-auto page-x-pad h-16 flex items-center justify-between" style={{ gap: 24 }}>
        {/* Logo + label */}
        <div className="flex items-center min-w-0" style={{ gap: 10, flexShrink: 0, maxWidth: "55%" }}>
          <Link href="/dashboard" className="shrink-0" aria-label="Home">
            {tournamentLogo ? (
              <img
                src={tournamentLogo}
                alt={tournamentName ?? "Tournament"}
                style={{ width: 36, height: 36, objectFit: "contain" }}
              />
            ) : (
              <>
                <span className="hidden sm:block"><MatchdayLogo size={30} /></span>
                <span className="sm:hidden"><MatchdayLogo variant="icon" size={30} /></span>
              </>
            )}
          </Link>

          {/* Text label next to logo — tournament name + group name */}
          {(tournamentName || currentGroup) && (
            <div className="flex flex-col justify-center leading-tight min-w-0">
              {tournamentName && (
                <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-wide truncate">
                  {tournamentName}
                </span>
              )}
              {currentGroup && (
                <span className="text-sm font-bold text-neutral-900 truncate">
                  {currentGroup.name}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Desktop tabs — left-aligned, injected from group layout via context */}
        {tabs.length > 0 ? (
          <nav className="hidden sm:flex items-center h-16 flex-1" style={{ gap: 0 }}>
            {tabs.map((t) => {
              const active = isActive(t.href, t.exact);
              const Icon = ICON_MAP[t.iconName];
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className={cn(
                    "inline-flex items-center text-sm font-medium transition-all rounded-full",
                    active
                      ? "bg-neutral-900 text-white"
                      : "text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100"
                  )}
                  style={{ gap: 7, paddingLeft: 14, paddingRight: 14, paddingTop: 7, paddingBottom: 7 }}
                >
                  {Icon && <Icon className={cn("w-4 h-4 shrink-0", active ? "text-white" : "text-neutral-400")} />}
                  {t.label}
                  {(t.pending ?? 0) > 0 && (
                    <span className="inline-flex items-center justify-center min-w-5 h-5 rounded-full bg-amber-500 text-white text-xs font-semibold leading-none" style={{ paddingLeft: 5, paddingRight: 5 }}>
                      {t.pending}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        ) : (
          <div className="flex-1" />
        )}

        {/* User menu */}
        <div className="relative shrink-0" ref={userRef}>
          <button
            onClick={() => setUserMenuOpen((v) => !v)}
            className="flex items-center h-9 rounded-xl hover:bg-neutral-100 transition-colors"
            style={{ gap: 8, paddingLeft: 8, paddingRight: 8 }}
          >
            <div className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ backgroundColor: userAvatarColor.bg, color: userAvatarColor.text, fontSize: userAvatarEmoji ? 16 : 11, fontWeight: userAvatarEmoji ? "normal" : "bold" }}>
              {userAvatarEmoji ?? userInitials}
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-neutral-400 hidden sm:block" />
          </button>

          {userMenuOpen && (
            <div
              className="absolute right-0 top-full bg-white rounded-xl border border-neutral-200 shadow-xl overflow-hidden"
              style={{ marginTop: 8, width: 288 }}
            >
              <div
                className="border-b border-neutral-100 bg-neutral-50"
                style={{ paddingTop: 14, paddingBottom: 14, paddingLeft: 16, paddingRight: 16 }}
              >
                <div className="text-sm font-semibold text-neutral-900 truncate">{user.name}</div>
                <div className="text-xs text-neutral-500 truncate" style={{ marginTop: 2 }}>
                  {user.email}
                </div>
              </div>

              {groups.length > 0 && (
                <>
                  <div
                    className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 border-b border-neutral-100"
                    style={{
                      paddingTop: 10,
                      paddingBottom: 10,
                      paddingLeft: 16,
                      paddingRight: 16,
                    }}
                  >
                    Switch group
                  </div>
                  <div
                    className="overflow-y-auto border-b border-neutral-100"
                    style={{ maxHeight: 240, paddingTop: 4, paddingBottom: 4 }}
                  >
                    {groups.map((g) => (
                      <Link
                        key={g.id}
                        href={`/group/${g.id}`}
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center justify-between text-sm text-neutral-700 hover:bg-neutral-50 transition-colors"
                        style={{
                          paddingTop: 10,
                          paddingBottom: 10,
                          paddingLeft: 16,
                          paddingRight: 16,
                        }}
                      >
                        <span className="truncate font-medium">{g.name}</span>
                        {g.id === currentGroupId && (
                          <Check
                            className="w-4 h-4 text-emerald-600 shrink-0"
                            style={{ marginLeft: 8 }}
                          />
                        )}
                      </Link>
                    ))}
                  </div>
                </>
              )}

              <div style={{ padding: 6, display: "flex", flexDirection: "column", gap: 2 }}>
                <Link
                  href="/settings"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center rounded-lg text-sm text-neutral-700 hover:bg-neutral-50 transition-colors"
                  style={{ gap: 10, paddingTop: 10, paddingBottom: 10, paddingLeft: 12, paddingRight: 12 }}
                >
                  <UserPen className="w-4 h-4 text-neutral-400" />
                  Edit profile
                </Link>
                <Link
                  href="/dashboard?new=1"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center rounded-lg text-sm text-neutral-700 hover:bg-neutral-50 transition-colors"
                  style={{ gap: 10, paddingTop: 10, paddingBottom: 10, paddingLeft: 12, paddingRight: 12 }}
                >
                  <Plus className="w-4 h-4 text-neutral-400" />
                  Join or create a group
                </Link>
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="w-full flex items-center rounded-lg text-sm text-neutral-700 hover:bg-neutral-50 transition-colors"
                  style={{
                    gap: 10,
                    paddingTop: 10,
                    paddingBottom: 10,
                    paddingLeft: 12,
                    paddingRight: 12,
                  }}
                >
                  <LogOut className="w-4 h-4 text-neutral-400" />
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export function AppNav(props: AppNavProps) {
  return <AppNavInner {...props} />;
}
