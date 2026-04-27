"use client";

import { useState } from "react";
import { CircleFlag } from "@/components/flag";
import { FD_CLUB_IDS } from "@/lib/fd-club-ids";

type BadgeSize = "sm" | "md" | "lg";
const BADGE_PX: Record<BadgeSize, number> = { sm: 28, md: 40, lg: 56 };

// football-data.org team IDs — used to load SVG crests
const FD_IDS = FD_CLUB_IDS;

const CLUB_COLORS: Record<string, string> = {
  MCI: "#6CABDD", RMA: "#FEBE10", BAY: "#DC052D", PSG: "#003DA5",
  LIV: "#C8102E", BAR: "#A50044", ARS: "#EF0107", INT: "#010E80",
  CHE: "#034694", B04: "#E32221", ATM: "#CB3524", JUV: "#2B2B2B",
  BVB: "#FDE100", MIL: "#FB090B", ATA: "#1E4B9A", NAP: "#12A0C3",
  TOT: "#132257", SLB: "#E31E24", OM:  "#2196B5", SCP: "#007534",
  SGE: "#E2001A", CLB: "#BE0712", VIL: "#FFD400", PSV: "#E1001A",
  ASM: "#E01010", GAL: "#CC0000", LIL: "#C8102E", AJX: "#CC0000",
  SHK: "#E77020", USG: "#1B64C8", YB:  "#1A1A1A", FCK: "#007AC2",
  RSB: "#E8201A", SLP: "#CC0000", BOD: "#F5A623", OLY: "#CC0000",
  AVL: "#95BFE5", FEY: "#CC0000", RBL: "#DD0741", CEL: "#16A34A",
  GNK: "#003DA5",
  NEW: "#241F20", ATH: "#EE2523", QAR: "#000000", PAF: "#003DA5", KAI: "#FFB81C",
  TBD: "#D1D5DB",
};

function textColor(bg: string): string {
  const hex = bg.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55 ? "#000" : "#fff";
}

function ClubFallback({ code, size }: { code: string; size: BadgeSize }) {
  const px = BADGE_PX[size];
  const bg = CLUB_COLORS[code] ?? "#6B7280";
  const fontSize = size === "sm" ? 8 : size === "md" ? 11 : 14;
  return (
    <span
      style={{
        width: px, height: px, borderRadius: "50%", backgroundColor: bg,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, boxShadow: "0 0 0 1px rgba(0,0,0,0.1)",
      }}
      aria-label={code}
    >
      <span style={{ fontSize, fontWeight: 700, color: textColor(bg), letterSpacing: "-0.5px", lineHeight: 1 }}>
        {code}
      </span>
    </span>
  );
}

function ClubBadge({ code, size }: { code: string; size: BadgeSize }) {
  const [failed, setFailed] = useState(false);
  const fdId = FD_IDS[code];
  const px = BADGE_PX[size];

  if (!fdId || failed) return <ClubFallback code={code} size={size} />;

  return (
    <span
      style={{
        width: px, height: px, borderRadius: "50%", background: "#fff",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, overflow: "hidden", boxShadow: "0 0 0 1px rgba(0,0,0,0.1)",
      }}
      aria-label={code}
    >
      <img
        src={`https://crests.football-data.org/${fdId}.svg`}
        alt={code}
        style={{ width: px * 0.8, height: px * 0.8, objectFit: "contain" }}
        onError={() => setFailed(true)}
      />
    </span>
  );
}

interface TeamBadgeProps {
  code: string;
  tournamentKind: string;
  size?: BadgeSize;
}

export function TeamBadge({ code, tournamentKind, size = "md" }: TeamBadgeProps) {
  if (tournamentKind === "WC_2026") return <CircleFlag code={code} size={size} />;
  return <ClubBadge code={code} size={size} />;
}
