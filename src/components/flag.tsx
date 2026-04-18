import * as Flags from "country-flag-icons/react/3x2";
import { FIFA_TO_ISO } from "@/lib/flags";

type FlagSize = "xs" | "sm" | "md" | "lg";

const SIZE_CLASSES: Record<FlagSize, string> = {
  xs: "w-4 h-[0.667rem]", // 16x~10.67px
  sm: "w-6 h-4", // 24x16
  md: "w-8 h-[1.333rem]", // 32x~21.33px
  lg: "w-12 h-8", // 48x32
};

interface FlagProps {
  code: string; // FIFA 3-letter code
  size?: FlagSize;
  className?: string;
  title?: string;
}

/** St. George's Cross — England */
function EnglandFlag({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 60 40" className={className} aria-label={title ?? "England"}>
      <rect width="60" height="40" fill="#ffffff" />
      <rect x="24" width="12" height="40" fill="#CE1124" />
      <rect y="16" width="60" height="8" fill="#CE1124" />
    </svg>
  );
}

/** Saltire — Scotland */
function ScotlandFlag({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 60 40" className={className} aria-label={title ?? "Scotland"}>
      <rect width="60" height="40" fill="#0065BD" />
      <path d="M0,0 L60,40 M60,0 L0,40" stroke="#ffffff" strokeWidth="6" />
    </svg>
  );
}

export function Flag({ code, size = "sm", className = "", title }: FlagProps) {
  const sizeClass = SIZE_CLASSES[size];
  const base = `${sizeClass} rounded-sm overflow-hidden shrink-0 ring-1 ring-black/5 ${className}`;

  if (code === "ENG") return <EnglandFlag className={base} title={title ?? "England"} />;
  if (code === "SCO") return <ScotlandFlag className={base} title={title ?? "Scotland"} />;

  const iso = FIFA_TO_ISO[code];
  if (!iso) {
    return (
      <span
        className={`${base} bg-neutral-200 inline-flex items-center justify-center text-[8px] font-semibold text-neutral-500`}
        aria-label={title ?? code}
      >
        {code}
      </span>
    );
  }

  const FlagSvg = (Flags as Record<string, React.ComponentType<{ className?: string; title?: string }>>)[iso];
  if (!FlagSvg) {
    return (
      <span className={`${base} bg-neutral-200`} aria-label={title ?? code} />
    );
  }

  return <FlagSvg className={base} title={title ?? code} />;
}
