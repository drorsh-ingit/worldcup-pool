"use client";

import { createContext, useContext, useState } from "react";
import type { ComponentType } from "react";

export type NavTab = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  exact?: boolean;
  pending?: number;
};

export type NavMeta = {
  tabs: NavTab[];
  tournamentLogo?: string | null;
  tournamentName?: string | null;
};

type NavTabsContextType = {
  meta: NavMeta;
  setMeta: (meta: NavMeta) => void;
};

const NavTabsContext = createContext<NavTabsContextType>({
  meta: { tabs: [] },
  setMeta: () => {},
});

export function NavTabsProvider({ children }: { children: React.ReactNode }) {
  const [meta, setMeta] = useState<NavMeta>({ tabs: [] });
  return <NavTabsContext.Provider value={{ meta, setMeta }}>{children}</NavTabsContext.Provider>;
}

export function useNavMeta() {
  return useContext(NavTabsContext).meta;
}

export function useSetNavMeta() {
  return useContext(NavTabsContext).setMeta;
}

// Backwards-compat shims
export function useNavTabs() {
  return useContext(NavTabsContext).meta.tabs;
}

export function useSetNavTabs() {
  const setMeta = useContext(NavTabsContext).setMeta;
  const meta = useContext(NavTabsContext).meta;
  return (tabs: NavTab[]) => setMeta({ ...meta, tabs });
}
