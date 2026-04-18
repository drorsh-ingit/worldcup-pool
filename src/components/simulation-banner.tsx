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
    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
      <FlaskConical className="w-4 h-4 text-amber-600 shrink-0" />
      <p className="text-sm text-amber-800">
        <span className="font-medium">Simulation mode</span>
        <span className="mx-1.5 text-amber-300">|</span>
        {formatted}
      </p>
    </div>
  );
}
