"use client";

import { NavTabsProvider } from "@/lib/nav-tabs-context";

/** Wraps the entire app shell in the NavTabsProvider so both AppNav and
 *  group-layout children share the same context instance. */
export function NavShell({ children }: { children: React.ReactNode }) {
  return <NavTabsProvider>{children}</NavTabsProvider>;
}
