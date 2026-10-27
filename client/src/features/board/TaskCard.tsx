import clsx from "clsx";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { KeyboardEvent } from "react";
import { Avatar } from "../../components/ui/Avatar";
import type { Task } from "../../lib/types";
import { DueBadge, PriorityMark } from "../tasks/meta";

export function CardBody({ task, assignee, lifted = false }: { task: Task; assignee: string | null; lifted?: boolean }) {
  return (
    <div
      className={clsx(
        "rounded-lg border bg-surface p-3 text-left",
        lifted ? "rotate-[1.5deg] border-line-strong shadow-[var(--shadow-lift)]" : "border-line hover:border-line-strong",
      )}
    >
      <p className={clsx("text-sm leading-snug font-medium", task.status === "done" && "text-muted")}>{task.title}</p>
      {task.labels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {task.labels.slice(0, 3).map((l) => (
            <span key={l} className="rounded bg-canvas px-1.5 py-0.5 text-[11px] font-medium text-muted">
              {l}
            </span>
          ))}
        </div>
      )}
      <div className="mt-2.5 flex min-h-5 items-center gap-3">
        <PriorityMark priority={task.priority} />
        <DueBadge due={task.dueDate} status={task.status} />
        <span className="ml-auto">{task.assigneeId && assignee ? <Avatar id={task.assigneeId} name={assignee} size={22} /> : null}</span>
      </div>
    </div>
  );
}

/** A draggable card. Space picks it up (arrows move it, Space drops); Enter opens it. */
export function TaskCard({ task, assignee, onOpen, disabled }: { task: Task; assignee: string | null; onOpen: () => void; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, data: { status: task.status }, disabled });
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" && !isDragging) {
      e.preventDefault();
      onOpen();
      return;
    }
    if (!disabled) listeners?.onKeyDown?.(e);
  };
  // Viewers get a plain button-like card: it opens, but nothing suggests it can be dragged.
  const dragProps = disabled ? { role: "button", tabIndex: 0 } : { ...attributes, ...listeners };
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...dragProps}
      onKeyDown={onKeyDown}
      onClick={onOpen}
      aria-roledescription={disabled ? undefined : "draggable task"}
      aria-label={`${task.title}${assignee ? `, assigned to ${assignee}` : ""}${task.dueDate ? `, due ${task.dueDate}` : ""}`}
      data-testid="task-card"
      className={clsx("cursor-pointer touch-manipulation rounded-lg", isDragging && "opacity-40")}
    >
      <CardBody task={task} assignee={assignee} />
    </div>
  );
}
