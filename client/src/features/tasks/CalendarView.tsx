import clsx from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { DndContext, type DragEndEvent, KeyboardSensor, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { useUpdateTaskMutation } from "../../app/api";
import { Button } from "../../components/ui/Button";
import { fromDay, monthGrid, monthLabel, sameMonth, shiftMonth, today } from "../../lib/dates";
import { STATUS_COLOR, type Task } from "../../lib/types";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function Chip({ task, onOpen, editable }: { task: Task; onOpen: () => void; editable: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id, disabled: !editable });
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onOpen();
        } else listeners?.onKeyDown?.(e);
      }}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 20 } : undefined}
      data-testid="calendar-chip"
      className={clsx(
        "flex w-full items-center gap-1.5 truncate rounded-md border border-line bg-surface px-1.5 py-0.5 text-left text-[12px] hover:border-line-strong",
        task.status === "done" && "text-muted line-through",
        isDragging && "shadow-[var(--shadow-lift)]",
      )}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: STATUS_COLOR[task.status] }} aria-hidden="true" />
      <span className="truncate">{task.title}</span>
    </button>
  );
}

function DayCell({ day, tasks, inMonth, onOpen, editable }: { day: string; tasks: Task[]; inMonth: boolean; onOpen: (id: string) => void; editable: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${day}` });
  const isToday = day === today();
  const label = fromDay(day).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  return (
    <div
      ref={setNodeRef}
      role="gridcell"
      aria-label={`${label}, ${tasks.length} task${tasks.length === 1 ? "" : "s"}`}
      className={clsx("flex min-h-24 flex-col gap-1 border-t border-l border-line p-1.5", inMonth ? "bg-surface" : "bg-canvas/60", isOver && "bg-pine-soft")}
    >
      <span className={clsx("self-start rounded-full px-1.5 text-[12px] font-semibold", isToday ? "bg-pine text-white" : inMonth ? "text-ink" : "text-muted")}>
        {fromDay(day).getDate()}
      </span>
      {tasks.slice(0, 4).map((t) => (
        <Chip key={t.id} task={t} onOpen={() => onOpen(t.id)} editable={editable} />
      ))}
      {tasks.length > 4 && <span className="px-1 text-[11px] text-muted">+{tasks.length - 4} more</span>}
    </div>
  );
}

function Unscheduled({ tasks, onOpen, editable }: { tasks: Task[]; onOpen: (id: string) => void; editable: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: "day:none" });
  return (
    <aside ref={setNodeRef} aria-label="No due date" className={clsx("rounded-xl border border-line bg-surface p-3", isOver && "bg-pine-soft")}>
      <h3 className="text-sm font-semibold">No due date</h3>
      <p className="mt-0.5 text-[12px] text-muted">Drag onto a day to schedule.</p>
      <div className="mt-3 flex flex-col gap-1">
        {tasks.map((t) => (
          <Chip key={t.id} task={t} onOpen={() => onOpen(t.id)} editable={editable} />
        ))}
        {!tasks.length && <p className="text-[12px] text-muted">Everything has a date.</p>}
      </div>
    </aside>
  );
}

export function CalendarView({ tasks, onOpen, editable }: { tasks: Task[]; onOpen: (id: string) => void; editable: boolean }) {
  const [cursor, setCursor] = useState(today());
  const [update] = useUpdateTaskMutation();
  const weeks = useMemo(() => monthGrid(cursor), [cursor]);
  const byDay = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of tasks) if (t.dueDate) m.set(t.dueDate, [...(m.get(t.dueDate) ?? []), t]);
    return m;
  }, [tasks]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] } }),
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return;
    const task = tasks.find((t) => t.id === active.id);
    const target = String(over.id).slice(4);
    const dueDate = target === "none" ? null : target;
    if (task && task.dueDate !== dueDate) update({ task, patch: { dueDate } });
  };

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="grid gap-4 px-4 pb-6 lg:grid-cols-[1fr_220px] lg:px-6">
        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="mr-auto text-lg font-semibold" aria-live="polite">
              {monthLabel(cursor)}
            </h2>
            <Button size="sm" onClick={() => setCursor(today())}>
              Today
            </Button>
            <Button size="sm" variant="ghost" aria-label="Previous month" onClick={() => setCursor((c) => shiftMonth(c, -1))}>
              <ChevronLeft size={16} />
            </Button>
            <Button size="sm" variant="ghost" aria-label="Next month" onClick={() => setCursor((c) => shiftMonth(c, 1))}>
              <ChevronRight size={16} />
            </Button>
          </div>
          <div className="overflow-x-auto">
            <div role="grid" aria-label={monthLabel(cursor)} className="min-w-[640px] overflow-hidden rounded-xl border-r border-b border-line">
              <div role="row" className="grid grid-cols-7">
                {WEEKDAYS.map((d) => (
                  <div key={d} role="columnheader" className="border-t border-l border-line bg-canvas px-2 py-1.5 text-[12px] font-semibold text-muted">
                    {d}
                  </div>
                ))}
              </div>
              {weeks.map((week) => (
                <div key={week[0]} role="row" className="grid grid-cols-7">
                  {week.map((day) => (
                    <DayCell key={day} day={day} tasks={byDay.get(day) ?? []} inMonth={sameMonth(day, cursor)} onOpen={onOpen} editable={editable} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
        <Unscheduled tasks={tasks.filter((t) => !t.dueDate && t.status !== "done")} onOpen={onOpen} editable={editable} />
      </div>
    </DndContext>
  );
}
