import { Search, X } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { isFiltering, readFilter } from "../../lib/filters";
import { PRIORITIES, PRIORITY_LABEL, type Member } from "../../lib/types";

/** Filters live in the URL, so a filtered view can be shared or reloaded. */
export function FilterBar({ members, meId }: { members: Member[]; meId: string }) {
  const [params, setParams] = useSearchParams();
  const f = readFilter(params);
  const set = (key: string, value: string) =>
    setParams(
      (p) => {
        if (value) p.set(key, value);
        else p.delete(key);
        return p;
      },
      { replace: true },
    );

  return (
    <div className="flex flex-wrap items-center gap-2" role="search">
      <label className="relative">
        <span className="sr-only">Search tasks</span>
        <Search size={15} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input value={f.q} onChange={(e) => set("q", e.target.value)} placeholder="Search tasks or labels" className="field h-8 w-52 py-1 pl-8 text-sm" />
      </label>
      <label>
        <span className="sr-only">Assignee</span>
        <select value={f.assignee} onChange={(e) => set("assignee", e.target.value)} className="field h-8 w-auto py-1 text-sm">
          <option value="">Anyone</option>
          <option value="me">Assigned to me</option>
          <option value="none">Unassigned</option>
          {members
            .filter((m) => m.userId !== meId)
            .map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        <span className="sr-only">Priority</span>
        <select value={f.priority} onChange={(e) => set("priority", e.target.value)} className="field h-8 w-auto py-1 text-sm">
          <option value="">Any priority</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </select>
      </label>
      {isFiltering(f) && (
        <button
          type="button"
          onClick={() =>
            setParams(
              (p) => {
                ["q", "assignee", "priority"].forEach((k) => p.delete(k));
                return p;
              },
              { replace: true },
            )
          }
          className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-pine hover:bg-pine-soft"
        >
          <X size={14} /> Clear filters
        </button>
      )}
    </div>
  );
}
