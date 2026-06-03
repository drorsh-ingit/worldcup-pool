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

  useEffect(() => {
    setMeta({ tabs, tournamentLogo, tournamentName });
    return () => setMeta({ tabs: [] }); // clear on unmount (leaving group)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
