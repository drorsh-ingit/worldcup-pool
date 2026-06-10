/**
 * Maps football-data.org national-team TLAs to our internal team codes.
 *
 * Verified this session: all 48 WC 2026 codes match the feed's TLAs exactly except
 * two — Curaçao (FD "CUW" → our "CUR") and Uruguay (FD "URY" → our "URU"). Everything
 * else is identity, so we only list the exceptions and fall back to the TLA as-is.
 */
const FD_TLA_OVERRIDES: Record<string, string> = {
  CUW: "CUR",
  URY: "URU",
};

/** Resolve a football-data TLA to our team code (identity unless overridden). */
export function fdTlaToCode(tla: string | null | undefined): string | null {
  if (!tla) return null;
  return FD_TLA_OVERRIDES[tla] ?? tla;
}
