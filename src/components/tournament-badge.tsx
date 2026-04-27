const LOGO_SRCS: Record<string, string> = {
  WC_2026: "/logos/wc2026.webp",
  UCL_2026: "/logos/ucl2026.svg",
};

interface TournamentBadgeProps {
  kind: string;
  name: string;
}

export function TournamentBadge({ kind, name }: TournamentBadgeProps) {
  const logo = LOGO_SRCS[kind];

  return (
    <div
      className="flex items-center gap-3 border-b border-neutral-100"
      style={{ paddingTop: 12, paddingBottom: 12, paddingLeft: 4, paddingRight: 4 }}
    >
      {logo && (
        <img
          src={logo}
          alt=""
          style={{ width: 40, height: 40, objectFit: "contain", flexShrink: 0 }}
        />
      )}
      <span className="text-sm font-semibold text-neutral-700 truncate">{name}</span>
    </div>
  );
}
