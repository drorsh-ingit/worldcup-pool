"use client";

import { createContext, useContext, useState } from "react";

export type NavTab = {
  href: string;
  label: string;
  iconName: string; // string name — resolved to component on the client
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

export function useNavTabs() {
  return useContext(NavTabsContext).meta.tabs;
}
