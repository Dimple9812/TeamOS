import { STATUSES, type Task, type TaskStatus } from "./types";

export type Columns = Record<TaskStatus, Task[]>;

/** Tasks grouped by status, each column in board order. */
export function groupByStatus(tasks: Task[]): Columns {
  const cols: Columns = { todo: [], in_progress: [], review: [], done: [] };
  for (const t of tasks) cols[t.status].push(t);
  for (const s of STATUSES) cols[s].sort((a, b) => a.order - b.order);
  return cols;
}

/** Same rule as the server: halfway between neighbours, or one step past the end. */
export function orderBetween(prev: number | null, next: number | null) {
  if (prev === null && next === null) return 1024;
  if (prev === null) return next! - 1024;
  if (next === null) return prev + 1024;
  return (prev + next) / 2;
}

/**
 * For a card dropped at `index` in the `status` column, the cards that will sit directly above and below it.
 * `column` is the destination column *without* the moving card.
 */
export function neighboursAt(column: Task[], index: number) {
  const prev = index > 0 ? column[index - 1] : null;
  const next = index < column.length ? column[index] : null;
  return { prev, next };
}

/** Applies a move locally (optimistic update) using the same ordering rule the server uses. */
export function applyMove(tasks: Task[], taskId: string, status: TaskStatus, prevId: string | null, nextId: string | null): Task[] {
  const moving = tasks.find((t) => t.id === taskId);
  if (!moving) return tasks;
  const prev = prevId ? tasks.find((t) => t.id === prevId) : undefined;
  const next = nextId ? tasks.find((t) => t.id === nextId) : undefined;
  const lastInColumn = tasks.filter((t) => t.status === status && t.id !== taskId).reduce<number | null>((m, t) => (m === null || t.order > m ? t.order : m), null);
  const order = prev || next ? orderBetween(prev?.order ?? null, next?.order ?? null) : orderBetween(lastInColumn, null);
  const completedAt = status === "done" ? (moving.status === "done" ? moving.completedAt : new Date().toISOString()) : null;
  return tasks.map((t) => (t.id === taskId ? { ...t, status, order, completedAt } : t));
}

/** Realtime merge: an incoming task replaces ours only if it is at least as new, so late echoes can't undo a newer edit. */
export function upsertTask(tasks: Task[], incoming: Task): Task[] {
  const i = tasks.findIndex((t) => t.id === incoming.id);
  if (i === -1) return [...tasks, incoming];
  if (incoming.version < tasks[i].version) return tasks;
  const copy = tasks.slice();
  copy[i] = incoming;
  return copy;
}
