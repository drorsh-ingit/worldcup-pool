"use client";

import { useEffect } from "react";

export function ScrollToMatch({ matchId }: { matchId: string }) {
  useEffect(() => {
    const el = document.getElementById(`match-${matchId}`);
    if (el) {
      const OFFSET = 220;
      const top = el.getBoundingClientRect().top + window.scrollY - OFFSET;
      window.scrollTo({ top, behavior: "smooth" });
    }
  }, [matchId]);
  return null;
}
