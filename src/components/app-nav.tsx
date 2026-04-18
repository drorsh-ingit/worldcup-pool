"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { signOut } from "next-auth/react";
import { useState, useRef, useEffect } from "react";
import { LogOut, User, ChevronDown, Check, Plus, LayoutGrid } from "lucide-react";

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

  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setSwitcherOpen(false);
      }
      if (userRef.current && !userRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-neutral-200">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
        {/* Brand + group switcher */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 shrink-0"
            aria-label="Home"
          >
            <div className="w-8 h-8 rounded-lg pitch-bg flex items-center justify-center">
              <span className="font-display text-white text-sm font-bold">P</span>
            </div>
            <span className="font-display font-semibold text-neutral-900 text-base hidden sm:inline">
              Pool
            </span>
          </Link>

          {/* Group switcher */}
          <div className="relative min-w-0" ref={switcherRef}>
            <button
              onClick={() => setSwitcherOpen((v) => !v)}
              className="h-9 px-2.5 rounded-lg text-sm font-medium inline-flex items-center gap-1.5 text-neutral-700 hover:bg-neutral-100 transition-colors max-w-[55vw] sm:max-w-none"
            >
              <span className="truncate">
                {currentGroup?.name ?? "Your groups"}
              </span>
              <ChevronDown className="w-4 h-4 text-neutral-400 shrink-0" />
            </button>

            {switcherOpen && (
              <div className="absolute top-full left-0 mt-1.5 w-72 bg-white rounded-xl border border-neutral-200 shadow-lg overflow-hidden">
                <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400 border-b border-neutral-100">
                  Switch group
                </div>
                <div className="max-h-64 overflow-y-auto py-1">
                  {groups.length === 0 && (
                    <div className="px-3 py-4 text-sm text-neutral-500 text-center">
                      You haven&apos;t joined any groups yet.
                    </div>
                  )}
                  {groups.map((g) => (
                    <Link
                      key={g.id}
                      href={`/group/${g.id}`}
                      onClick={() => setSwitcherOpen(false)}
                      className="flex items-center justify-between px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
                    >
                      <span className="truncate">{g.name}</span>
                      {g.id === currentGroupId && (
                        <Check className="w-4 h-4 text-pitch-500 shrink-0" />
                      )}
                    </Link>
                  ))}
                </div>
                <div className="border-t border-neutral-100 p-1">
                  <Link
                    href="/dashboard"
                    onClick={() => setSwitcherOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-neutral-700 hover:bg-neutral-50"
                  >
                    <LayoutGrid className="w-4 h-4 text-neutral-400" />
                    All groups
                  </Link>
                  <Link
                    href="/dashboard"
                    onClick={() => setSwitcherOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-neutral-700 hover:bg-neutral-50"
                  >
                    <Plus className="w-4 h-4 text-neutral-400" />
                    Join or create a group
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* User menu */}
        <div className="relative" ref={userRef}>
          <button
            onClick={() => setUserMenuOpen((v) => !v)}
            className="flex items-center gap-2 h-9 px-1.5 rounded-lg hover:bg-neutral-100 transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-neutral-100 flex items-center justify-center">
              <User className="w-3.5 h-3.5 text-neutral-500" />
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-neutral-400 hidden sm:block" />
          </button>
          {userMenuOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-56 bg-white rounded-xl border border-neutral-200 shadow-lg overflow-hidden">
              <div className="px-3 py-2.5 border-b border-neutral-100">
                <div className="text-sm font-medium text-neutral-900 truncate">{user.name}</div>
                <div className="text-xs text-neutral-500 truncate">{user.email}</div>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
              >
                <LogOut className="w-4 h-4 text-neutral-400" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

