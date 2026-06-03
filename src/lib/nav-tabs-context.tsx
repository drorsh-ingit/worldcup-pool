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

type NavTabsContextType = {
  tabs: NavTab[];
  setTabs: (tabs: NavTab[]) => void;
};

const NavTabsContext = createContext<NavTabsContextType>({ tabs: [], setTabs: () => {} });

export function NavTabsProvider({ children }: { children: React.ReactNode }) {
  const [tabs, setTabs] = useState<NavTab[]>([]);
  return <NavTabsContext.Provider value={{ tabs, setTabs }}>{children}</NavTabsContext.Provider>;
}

export function useNavTabs() {
  return useContext(NavTabsContext).tabs;
}

export function useSetNavTabs() {
  return useContext(NavTabsContext).setTabs;
}
