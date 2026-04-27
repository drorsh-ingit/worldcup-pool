import { FlaskConical } from "lucide-react";

export function SimulationBanner({ simulatedDate }: { simulatedDate: string }) {
  const d = new Date(simulatedDate);
  const formatted = d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="flex items-center gap-2">
      <FlaskConical className="w-3.5 h-3.5 text-pitch-700 shrink-0" />
      <p className="text-xs text-amber-800">
        <span className="font-semibold">Simulation mode</span>
        <span className="mx-1.5 text-amber-300">·</span>
        {formatted}
      </p>
    </div>
  );
}
