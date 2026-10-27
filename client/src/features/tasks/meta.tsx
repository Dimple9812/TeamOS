import clsx from "clsx";
import { AlertTriangle, ArrowUp, CalendarClock } from "lucide-react";
import { daysBetween, dueLabel, today } from "../../lib/dates";
import { PRIORITY_LABEL, type Priority, type TaskStatus } from "../../lib/types";

/** Only high and urgent get a visible mark; medium/low are the quiet default. */
export function PriorityMark({ priority, showAll = false }: { priority: Priority; showAll?: boolean }) {
  if (priority === "urgent")
    return (
      <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-danger">
        <AlertTriangle size={12} aria-hidden="true" />
        Urgent
      </span>
    );
  if (priority === "high")
    return (
      <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-st-progress">
        <ArrowUp size={12} aria-hidden="true" />
        High
      </span>
    );
  return showAll ? <span className="text-[12px] text-muted">{PRIORITY_LABEL[priority]}</span> : null;
}

export function DueBadge({ due, status, now = today() }: { due: string | null; status: TaskStatus; now?: string }) {
  if (!due) return null;
  const diff = daysBetween(now, due);
  const late = status !== "done" && diff < 0;
  const soon = status !== "done" && diff >= 0 && diff <= 1;
  return (
    <span
      className={clsx("inline-flex items-center gap-1 text-[12px]", late ? "font-semibold text-danger" : soon ? "font-semibold text-st-progress" : "text-muted")}
      title={`Due ${due}`}
    >
      <CalendarClock size={12} aria-hidden="true" />
      {status === "done" ? dueLabel(due, now).replace(/ days late$/, " days ago") : dueLabel(due, now)}
    </span>
  );
}
