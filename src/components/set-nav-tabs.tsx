"use client";

import { useEffect } from "react";
import { useSetNavMeta, type NavTab } from "@/lib/nav-tabs-context";

interface SetNavTabsProps {
  tabs: NavTab[];
  tournamentLogo?: string | null;
  tournamentName?: string | null;
}

export function SetNavTabs({ tabs, tournamentLogo, tournamentName }: SetNavTabsProps) {
  const setMeta = useSetNavMeta();

  // Re-run whenever pending counts change (router.refresh() passes new props)
  const pendingKey = tabs.map((t) => t.pending ?? 0).join(",");

  useEffect(() => {
    setMeta({ tabs, tournamentLogo, tournamentName });
    return () => setMeta({ tabs: [] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingKey]);

  return null;
}
