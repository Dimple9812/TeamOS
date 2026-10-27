import { Sparkles } from "lucide-react";
import type { AiSource } from "../../lib/types";

/** Says plainly where an answer came from, so nobody mistakes a template for the model or vice versa. */
export function SourceBadge({ source, note }: { source: AiSource; note?: string | null }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
      <span className="inline-flex items-center gap-1 rounded-full bg-pine-soft px-2 py-0.5 font-semibold text-pine-dark">
        <Sparkles size={12} aria-hidden="true" />
        {source === "ai" ? "Written by AI" : "Built-in planner"}
      </span>
      {note ?? (source === "template" ? "No AI key is configured, so this comes from TeamOS's own rules." : "Based only on this project's tasks.")}
    </p>
  );
}
