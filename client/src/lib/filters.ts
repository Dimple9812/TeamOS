import type { Priority, Task } from "./types";

export interface TaskFilter {
  q: string;
  /** "" = anyone, "me", "none" = unassigned, or a user id. */
  assignee: string;
  priority: Priority | "";
}

export const emptyFilter: TaskFilter = { q: "", assignee: "", priority: "" };

export function readFilter(params: URLSearchParams): TaskFilter {
  const p = params.get("priority");
  return {
    q: params.get("q") ?? "",
    assignee: params.get("assignee") ?? "",
    priority: p === "urgent" || p === "high" || p === "medium" || p === "low" ? p : "",
  };
}

export const isFiltering = (f: TaskFilter) => Boolean(f.q.trim() || f.assignee || f.priority);

export function applyFilter(tasks: Task[], f: TaskFilter, meId: string | undefined): Task[] {
  const q = f.q.trim().toLowerCase();
  return tasks.filter((t) => {
    if (q && !t.title.toLowerCase().includes(q) && !t.labels.some((l) => l.toLowerCase().includes(q))) return false;
    if (f.priority && t.priority !== f.priority) return false;
    if (f.assignee === "me" && t.assigneeId !== meId) return false;
    if (f.assignee === "none" && t.assigneeId) return false;
    if (f.assignee && f.assignee !== "me" && f.assignee !== "none" && t.assigneeId !== f.assignee) return false;
    return true;
  });
}
