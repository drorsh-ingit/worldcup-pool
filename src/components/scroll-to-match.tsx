"use client";

import { useEffect } from "react";

export function ScrollToMatch({ matchId }: { matchId: string }) {
  useEffect(() => {
    const el = document.getElementById(`match-${matchId}`);
    if (!el) return;

    // Use scrollIntoView so the browser respects CSS scroll-margin-top
    // on the target element, which accounts for sticky headers.
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [matchId]);
  return null;
}
