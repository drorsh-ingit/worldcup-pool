/** Shared avatar utilities */

const AVATAR_COLORS = [
  { bg: "#f59e0b", text: "#ffffff" }, // amber
  { bg: "#10b981", text: "#ffffff" }, // emerald
  { bg: "#3b82f6", text: "#ffffff" }, // blue
  { bg: "#8b5cf6", text: "#ffffff" }, // violet
  { bg: "#ec4899", text: "#ffffff" }, // pink
  { bg: "#f97316", text: "#ffffff" }, // orange
  { bg: "#06b6d4", text: "#ffffff" }, // cyan
  { bg: "#84cc16", text: "#ffffff" }, // lime
  { bg: "#ef4444", text: "#ffffff" }, // red
  { bg: "#6366f1", text: "#ffffff" }, // indigo
];

/** Deterministic color derived from the user's id/name so it's consistent */
export function getAvatarColor(seed: string): { bg: string; text: string } {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/** Two-letter initials: first letter of first word + first letter of last word */
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export const AVATAR_COLOR_OPTIONS = AVATAR_COLORS.map((c, i) => ({ ...c, id: i }));
