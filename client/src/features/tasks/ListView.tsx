import { ArrowDown, ArrowUp } from "lucide-react";
import { useMemo, useState } from "react";
import { useUpdateTaskMutation } from "../../app/api";
import { Avatar } from "../../components/ui/Avatar";
import { PRIORITIES, STATUS_COLOR, STATUS_LABEL, STATUSES, type Task, type TaskStatus } from "../../lib/types";
import { DueBadge, PriorityMark } from "./meta";

type SortKey = "title" | "status" | "assignee" | "priority" | "dueDate";

export function sortTasks(tasks: Task[], key: SortKey, dir: 1 | -1, names: Map<string, string>) {
  const rank = (t: Task): string | number => {
    switch (key) {
      case "title":
        return t.title.toLowerCase();
      case "status":
        return STATUSES.indexOf(t.status) * 1e9 + t.order;
      case "assignee":
        return t.assigneeId ? (names.get(t.assigneeId) ?? "").toLowerCase() : "￿";
      case "priority":
        return PRIORITIES.indexOf(t.priority);
      case "dueDate":
        // Tasks without a date always sort last.
        return t.dueDate ?? (dir === 1 ? "9999" : "0000");
    }
  };
  return [...tasks].sort((a, b) => {
    const x = rank(a);
    const y = rank(b);
    return (x < y ? -1 : x > y ? 1 : 0) * dir;
  });
}

const COLUMNS: { key: SortKey; label: string; className?: string }[] = [
  { key: "title", label: "Task" },
  { key: "status", label: "Status", className: "w-40" },
  { key: "assignee", label: "Assignee", className: "hidden w-44 md:table-cell" },
  { key: "priority", label: "Priority", className: "hidden w-28 sm:table-cell" },
  { key: "dueDate", label: "Due", className: "w-32" },
];

export function ListView({ tasks, names, onOpen, editable }: { tasks: Task[]; names: Map<string, string>; onOpen: (id: string) => void; editable: boolean }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "status", dir: 1 });
  const [update] = useUpdateTaskMutation();
  const rows = useMemo(() => sortTasks(tasks, sort.key, sort.dir, names), [tasks, sort, names]);

  if (!tasks.length) return <p className="px-6 py-10 text-center text-muted">No tasks match these filters.</p>;
  return (
    <div className="px-4 pb-6 lg:px-6">
      <table className="w-full table-fixed border-separate border-spacing-0 overflow-hidden rounded-xl border border-line bg-surface text-sm">
        <thead>
          <tr>
            {COLUMNS.map((c) => (
              <th
                key={c.key}
                scope="col"
                aria-sort={sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
                className={`border-b border-line px-3 py-2 text-left font-semibold text-muted ${c.className ?? ""}`}
              >
                <button
                  type="button"
                  className="inline-flex items-center gap-1 hover:text-ink"
                  onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : 1 }))}
                >
                  {c.label}
                  {sort.key === c.key && (sort.dir === 1 ? <ArrowUp size={13} /> : <ArrowDown size={13} />)}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} className="group hover:bg-canvas/70">
              <td className="border-b border-line px-3 py-2">
                <button type="button" onClick={() => onOpen(t.id)} className="block w-full truncate text-left font-medium hover:text-pine">
                  {t.title}
                </button>
              </td>
              <td className="border-b border-line px-3 py-2">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: STATUS_COLOR[t.status] }} aria-hidden="true" />
                  {editable ? (
                    <select
                      aria-label={`Status of ${t.title}`}
                      value={t.status}
                      onChange={(e) => update({ task: t, patch: { status: e.target.value as TaskStatus } })}
                      className="min-w-0 flex-1 rounded-md bg-transparent py-0.5 hover:bg-ink/5"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    STATUS_LABEL[t.status]
                  )}
                </span>
              </td>
              <td className="hidden border-b border-line px-3 py-2 md:table-cell">
                {t.assigneeId && names.get(t.assigneeId) ? (
                  <span className="flex items-center gap-2 truncate">
                    <Avatar id={t.assigneeId} name={names.get(t.assigneeId)!} size={20} />
                    {names.get(t.assigneeId)}
                  </span>
                ) : (
                  <span className="text-muted">Unassigned</span>
                )}
              </td>
              <td className="hidden border-b border-line px-3 py-2 sm:table-cell">
                <PriorityMark priority={t.priority} showAll />
              </td>
              <td className="border-b border-line px-3 py-2">{t.dueDate ? <DueBadge due={t.dueDate} status={t.status} /> : <span className="text-muted">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
