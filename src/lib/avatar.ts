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

/** DiceBear avatar styles */
export const DICEBEAR_STYLES = [
  { id: "adventurer",  label: "Adventurer" },
  { id: "avataaars",   label: "Avataaars" },
  { id: "bottts",      label: "Bots" },
  { id: "fun-emoji",   label: "Fun Emoji" },
  { id: "lorelei",     label: "Lorelei" },
  { id: "micah",       label: "Micah" },
  { id: "notionists",  label: "Notionists" },
  { id: "personas",    label: "Personas" },
  { id: "pixel-art",   label: "Pixel Art" },
  { id: "thumbs",      label: "Thumbs" },
  { id: "croodles",    label: "Croodles" },
  { id: "shapes",      label: "Shapes" },
] as const;

/** Build a DiceBear avatar URL */
export function dicebearUrl(style: string, seed: string): string {
  return `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}&radius=50`;
}

/** Random seed string */
export function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}
