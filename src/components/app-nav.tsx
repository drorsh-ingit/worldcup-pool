"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { signOut } from "next-auth/react";
import { useState, useRef, useEffect } from "react";
import { LogOut, ChevronDown, Check, Plus } from "lucide-react";
import { MatchdayLogo } from "@/components/matchday-logo";

interface GroupOption {
  id: string;
  name: string;
}

interface AppNavProps {
  user: { name: string; email: string };
  groups: GroupOption[];
}

export function AppNav({ user, groups }: AppNavProps) {
  const params = useParams<{ groupId?: string }>();
  const currentGroupId = params?.groupId;
  const currentGroup = groups.find((g) => g.id === currentGroupId);

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

  const userInitial = user.name?.charAt(0).toUpperCase() ?? "?";

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-neutral-200 shadow-sm">
      {/* Pitch-green accent stripe */}
      <div className="h-1 w-full" style={{ backgroundColor: "#4a8c2a" }} />

      <div className="max-w-screen-2xl mx-auto page-x-pad h-16 flex items-center justify-between gap-4">
        {/* Brand + current group label */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Link href="/dashboard" className="shrink-0" aria-label="Home">
            <span className="hidden sm:block">
              <MatchdayLogo size={34} />
            </span>
            <span className="sm:hidden">
              <MatchdayLogo variant="icon" size={34} />
            </span>
          </Link>

          {currentGroup && (
            <>
              <span className="text-neutral-200 text-xl font-light hidden sm:inline">/</span>
              <span className="text-sm font-medium text-neutral-700 truncate">
                {currentGroup.name}
              </span>
            </>
          )}
        </div>

        {/* User menu */}
        <div className="relative shrink-0" ref={userRef}>
          <button
            onClick={() => setUserMenuOpen((v) => !v)}
            className="flex items-center gap-2 h-9 px-2 rounded-xl hover:bg-neutral-100 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-emerald-100 border border-emerald-200 flex items-center justify-center">
              <span className="text-xs font-semibold text-emerald-700">{userInitial}</span>
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
                  href="/dashboard?new=1"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center rounded-lg text-sm text-neutral-700 hover:bg-neutral-50 transition-colors"
                  style={{
                    gap: 10,
                    paddingTop: 10,
                    paddingBottom: 10,
                    paddingLeft: 12,
                    paddingRight: 12,
                  }}
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
