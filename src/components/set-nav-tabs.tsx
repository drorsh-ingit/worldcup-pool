"use client";

import { useEffect } from "react";
import { useSetNavTabs, type NavTab } from "@/lib/nav-tabs-context";

export function SetNavTabs({ tabs }: { tabs: NavTab[] }) {
  const setTabs = useSetNavTabs();

  useEffect(() => {
    setTabs(tabs);
    return () => setTabs([]); // clear on unmount (leaving group)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
