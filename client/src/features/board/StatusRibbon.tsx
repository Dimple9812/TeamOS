import { STATUS_COLOR, STATUS_LABEL, STATUSES, type Task, type TaskStatus } from "../../lib/types";

/** The project at a glance: one segment per status, sized by how many tasks sit there. */
export function StatusRibbon({ tasks }: { tasks: Task[] }) {
  const counts = Object.fromEntries(STATUSES.map((s) => [s, tasks.filter((t) => t.status === s).length])) as Record<TaskStatus, number>;
  const total = tasks.length;
  const pct = total ? Math.round((counts.done / total) * 100) : 0;
  const summary = STATUSES.map((s) => `${counts[s]} ${STATUS_LABEL[s].toLowerCase()}`).join(", ");
  return (
    <div className="w-full max-w-md">
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="font-semibold">{pct}% done</span>
        <span className="text-muted">
          {counts.done} of {total} tasks
        </span>
      </div>
      <div className="mt-1.5 flex h-2 gap-px overflow-hidden rounded-full bg-line" role="img" aria-label={`Progress: ${summary}`}>
        {STATUSES.map((s) =>
          counts[s] ? (
            <span key={s} className="transition-[width] duration-500" style={{ width: `${(counts[s] / total) * 100}%`, background: STATUS_COLOR[s] }} />
          ) : null,
        )}
      </div>
    </div>
  );
}
