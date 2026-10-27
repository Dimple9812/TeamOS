import clsx from "clsx";
import { Plus } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import {
  closestCorners, DndContext, type DragEndEvent, type DragOverEvent, DragOverlay, type DragStartEvent, type KeyboardCoordinateGetter,
  KeyboardSensor, PointerSensor, TouchSensor, useDroppable, useSensor, useSensors,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useCreateTaskMutation, useMoveTaskMutation } from "../../app/api";
import { groupByStatus, neighboursAt } from "../../lib/board";
import { STATUS_COLOR, STATUS_LABEL, STATUSES, type Task, type TaskStatus } from "../../lib/types";
import { CardBody, TaskCard } from "./TaskCard";

type Lists = Record<TaskStatus, string[]>;
const toLists = (tasks: Task[]): Lists => {
  const g = groupByStatus(tasks);
  return Object.fromEntries(STATUSES.map((s) => [s, g[s].map((t) => t.id)])) as Lists;
};
const columnOf = (lists: Lists, id: string): TaskStatus | null =>
  (STATUSES as string[]).includes(id) ? (id as TaskStatus) : (STATUSES.find((s) => lists[s].includes(id)) ?? null);

/** Left/Right jump to the neighbouring column; Up/Down move within a column. */
const boardKeys: KeyboardCoordinateGetter = (event, args) => {
  if (event.code !== "ArrowLeft" && event.code !== "ArrowRight") return sortableKeyboardCoordinates(event, args);
  const { collisionRect, droppableRects } = args.context;
  if (!collisionRect) return undefined;
  const centre = collisionRect.left + collisionRect.width / 2;
  const rects = STATUSES.map((s) => droppableRects.get(s));
  const current = rects.findIndex((r) => r && centre >= r.left && centre <= r.right);
  const target = rects[(current === -1 ? 0 : current) + (event.code === "ArrowRight" ? 1 : -1)];
  if (!target) return undefined;
  event.preventDefault();
  return { x: target.left + 8, y: target.top + 8 };
};

function QuickAdd({ projectId, status }: { projectId: string; status: TaskStatus }) {
  const [open, setOpen] = useState(false);
  const [create, { isLoading }] = useCreateTaskMutation();
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem("title") as HTMLInputElement;
    const title = input.value.trim();
    if (!title) return setOpen(false);
    await create({ projectId, title, status });
    input.value = "";
  };
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted hover:bg-ink/5 hover:text-ink">
        <Plus size={15} /> Add task
      </button>
    );
  return (
    <form onSubmit={submit}>
      <label>
        <span className="sr-only">New task in {STATUS_LABEL[status]}</span>
        <input
          name="title"
          autoFocus
          maxLength={200}
          disabled={isLoading}
          placeholder="Task title, then Enter"
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          onBlur={(e) => !e.currentTarget.value && setOpen(false)}
          className="field text-sm"
        />
      </label>
    </form>
  );
}

function Column({
  status, ids, byId, names, onOpen, editable, projectId, totalInColumn,
}: {
  status: TaskStatus; ids: string[]; byId: Map<string, Task>; names: Map<string, string>; onOpen: (id: string) => void;
  editable: boolean; projectId: string; totalInColumn: number | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section aria-label={STATUS_LABEL[status]} className="flex w-[78vw] max-w-[300px] shrink-0 flex-col sm:w-72 lg:w-auto lg:max-w-none lg:min-w-[250px] lg:flex-1">
      <header className="mb-2 flex items-center gap-2 px-1">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLOR[status] }} aria-hidden="true" />
        <h2 className="text-sm font-semibold">{STATUS_LABEL[status]}</h2>
        <span className="text-[13px] text-muted">{totalInColumn === null ? ids.length : `${ids.length} of ${totalInColumn}`}</span>
      </header>
      <div
        ref={setNodeRef}
        className={clsx(
          "scroll-quiet flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto rounded-xl border-t-[3px] bg-ink/[0.035] p-2 transition-colors",
          isOver && "bg-pine-soft",
        )}
        style={{ borderTopColor: STATUS_COLOR[status] }}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {ids.map((id) => {
            const t = byId.get(id);
            return t ? <TaskCard key={id} task={t} assignee={t.assigneeId ? (names.get(t.assigneeId) ?? null) : null} onOpen={() => onOpen(id)} disabled={!editable} /> : null;
          })}
        </SortableContext>
        {ids.length === 0 && <p className="px-2 py-3 text-center text-[13px] text-muted">{editable ? "Drop a card here" : "Nothing here"}</p>}
        {editable && <QuickAdd projectId={projectId} status={status} />}
      </div>
    </section>
  );
}

export function BoardView({
  tasks, allTasks, names, onOpen, editable, projectId,
}: {
  /** Tasks after filters; `allTasks` gives the per-column totals. */
  tasks: Task[]; allTasks: Task[]; names: Map<string, string>; onOpen: (id: string) => void; editable: boolean; projectId: string;
}) {
  const [move] = useMoveTaskMutation();
  const byId = useMemo(() => new Map(allTasks.map((t) => [t.id, t])), [allTasks]);
  const fromServer = useMemo(() => toLists(tasks), [tasks]);
  // While dragging we keep a local copy so cards can hop between columns before anything is saved.
  const [dragLists, setDragLists] = useState<Lists | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const lists = dragLists ?? fromServer;
  const totals = useMemo(() => toLists(allTasks), [allTasks]);
  const filtering = tasks.length !== allTasks.length;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: boardKeys, keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] } }),
  );

  const onDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
    setDragLists(fromServer);
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over || !dragLists) return;
    const from = columnOf(dragLists, String(active.id));
    const to = columnOf(dragLists, String(over.id));
    if (!from || !to || from === to) return;
    setDragLists((cur) => {
      if (!cur) return cur;
      const source = cur[from].filter((id) => id !== active.id);
      const target = [...cur[to]];
      const overIndex = target.indexOf(String(over.id));
      target.splice(overIndex >= 0 ? overIndex : target.length, 0, String(active.id));
      return { ...cur, [from]: source, [to]: target };
    });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const current = dragLists;
    setActiveId(null);
    setDragLists(null);
    if (!over || !current) return;
    const id = String(active.id);
    const status = columnOf(current, id);
    if (!status) return;
    let column = current[status];
    const overIndex = column.indexOf(String(over.id));
    const fromIndex = column.indexOf(id);
    if (overIndex >= 0 && overIndex !== fromIndex) column = arrayMove(column, fromIndex, overIndex);

    const task = byId.get(id)!;
    const index = column.indexOf(id);
    const others = column.filter((x) => x !== id).map((x) => byId.get(x)!);
    const { prev, next } = neighboursAt(others, index);
    const original = fromServer[task.status];
    const unchanged = task.status === status && original.indexOf(id) === index;
    if (!unchanged) move({ task, status, prevId: prev?.id ?? null, nextId: next?.id ?? null });
  };

  const active = activeId ? byId.get(activeId) : null;
  const announcements = {
    onDragStart: ({ active }: { active: { id: string | number } }) => `Picked up ${byId.get(String(active.id))?.title}.`,
    onDragOver: ({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) => {
      if (!over || !dragLists) return undefined;
      const col = columnOf(dragLists, String(over.id));
      return col ? `${byId.get(String(active.id))?.title} is over ${STATUS_LABEL[col]}.` : undefined;
    },
    onDragEnd: ({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) => {
      const col = over && dragLists ? columnOf(dragLists, String(over.id)) : null;
      return col ? `Dropped ${byId.get(String(active.id))?.title} in ${STATUS_LABEL[col]}.` : "Move cancelled.";
    },
    onDragCancel: () => "Move cancelled.",
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveId(null);
        setDragLists(null);
      }}
      accessibility={{
        announcements,
        screenReaderInstructions: { draggable: "Press Space to pick up a task, arrow keys to move it, Space to drop, Escape to cancel. Press Enter to open it." },
      }}
    >
      <div className="flex h-full gap-3 overflow-x-auto px-4 pb-4 lg:px-6">
        {STATUSES.map((s) => (
          <Column
            key={s}
            status={s}
            ids={lists[s]}
            byId={byId}
            names={names}
            onOpen={onOpen}
            editable={editable}
            projectId={projectId}
            totalInColumn={filtering ? totals[s].length : null}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 160, easing: "ease-out" }}>
        {active ? <CardBody task={active} assignee={active.assigneeId ? (names.get(active.assigneeId) ?? null) : null} lifted /> : null}
      </DragOverlay>
    </DndContext>
  );
}
