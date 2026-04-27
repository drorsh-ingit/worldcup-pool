interface MatchdayLogoProps {
  /** Icon + wordmark (default) or icon only */
  variant?: "full" | "icon";
  /** Icon size in px */
  size?: number;
  /** Wordmark color class */
  textClass?: string;
}

/**
 * Matchday brand mark — a minimal football pitch icon on an amber square,
 * optionally paired with the wordmark.
 */
export function MatchdayLogo({
  variant = "full",
  size = 36,
  textClass = "text-neutral-900",
}: MatchdayLogoProps) {
  const r = size / 36; // scale factor
  const iconSize = size;

  return (
    <div className="flex items-center gap-2.5">
      {/* Icon mark */}
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Grass-green rounded square */}
        <rect width="36" height="36" rx="9" fill="#4a8c2a" />

        {/* Football pitch — top-down view */}
        {/* Pitch outline */}
        <rect x="5" y="7" width="26" height="22" rx="1.5" stroke="white" strokeWidth="1.5" fill="none" />
        {/* Halfway line */}
        <line x1="18" y1="7" x2="18" y2="29" stroke="white" strokeWidth="1.5" />
        {/* Centre circle */}
        <circle cx="18" cy="18" r="5" stroke="white" strokeWidth="1.5" fill="none" />
        {/* Centre dot */}
        <circle cx="18" cy="18" r="1.2" fill="white" />
        {/* Left penalty box */}
        <rect x="5" y="12" width="6" height="12" rx="0.5" stroke="white" strokeWidth="1" fill="none" opacity="0.7" />
        {/* Right penalty box */}
        <rect x="25" y="12" width="6" height="12" rx="0.5" stroke="white" strokeWidth="1" fill="none" opacity="0.7" />
      </svg>

      {/* Wordmark */}
      {variant === "full" && (
        <span
          className={`font-display font-semibold tracking-tight ${textClass}`}
          style={{ fontSize: Math.round(size * 0.5) }}
        >
          Matchday
        </span>
      )}
    </div>
  );
}
