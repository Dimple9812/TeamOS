import { type FormEvent, useState } from "react";
import { errorMessage, useBreakdownMutation, useBulkCreateTasksMutation } from "../../app/api";
import { useAppDispatch } from "../../app/hooks";
import { toast } from "../../app/uiSlice";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { fromDay, schedule, today } from "../../lib/dates";

const shortDay = (d: string | undefined) => (d ? fromDay(d).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "");
import { PRIORITIES, PRIORITY_LABEL, type AiSource, type Priority, type SuggestedTask } from "../../lib/types";
import { SourceBadge } from "./SourceBadge";

const EXAMPLES = ["Launch the referral programme", "Fix the slow checkout on mobile", "Hire a frontend engineer"];

interface Row extends SuggestedTask {
  keep: boolean;
}

/** Goal → suggested tasks → you choose which to add. Nothing is created until you confirm. */
export function BreakdownModal({ projectId, open, onClose }: { projectId: string; open: boolean; onClose: () => void }) {
  const [goal, setGoal] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [meta, setMeta] = useState<{ source: AiSource; note: string | null } | null>(null);
  const [withDates, setWithDates] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [breakdown, { isLoading: thinking }] = useBreakdownMutation();
  const [bulk, { isLoading: adding }] = useBulkCreateTasksMutation();
  const dispatch = useAppDispatch();

  const reset = () => {
    setRows(null);
    setMeta(null);
    setError(null);
  };
  const close = () => {
    reset();
    setGoal("");
    onClose();
  };

  const suggest = async (e?: FormEvent) => {
    e?.preventDefault();
    setError(null);
    try {
      const r = await breakdown({ projectId, goal }).unwrap();
      setRows(r.tasks.map((t) => ({ ...t, keep: true })));
      setMeta({ source: r.source, note: r.note });
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const kept = rows?.filter((r) => r.keep) ?? [];
  const due = schedule(kept.map((r) => r.estimateDays), today());

  const add = async () => {
    try {
      await bulk({
        projectId,
        goal,
        tasks: kept.map((r, i) => ({ title: r.title.trim(), description: r.description, priority: r.priority, dueDate: withDates ? due[i] : null })),
      }).unwrap();
      dispatch(toast(`Added ${kept.length} task${kept.length === 1 ? "" : "s"} to To do.`, "success"));
      close();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const edit = (i: number, patch: Partial<Row>) => setRows((rs) => rs!.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <Modal open={open} onClose={close} title="Break down a goal" width="max-w-2xl">
      {!rows ? (
        <form onSubmit={suggest} className="space-y-4">
          <label className="block">
            <span className="text-sm font-semibold">What do you want to get done?</span>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              rows={3}
              maxLength={500}
              autoFocus
              placeholder="e.g. Launch the new pricing page by the end of the month"
              className="field mt-1 resize-none"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" onClick={() => setGoal(ex)} className="rounded-full border border-line px-3 py-1 text-[13px] text-muted hover:border-line-strong hover:text-ink">
                {ex}
              </button>
            ))}
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button onClick={close}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={thinking || goal.trim().length < 5}>
              {thinking ? "Planning…" : "Suggest tasks"}
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          {meta && <SourceBadge source={meta.source} note={meta.note} />}
          <ol className="divide-y divide-line rounded-xl border border-line" aria-label="Suggested tasks">
            {rows.map((r, i) => (
              <li key={i} className="flex items-start gap-3 p-3">
                <input
                  type="checkbox"
                  checked={r.keep}
                  onChange={(e) => edit(i, { keep: e.target.checked })}
                  aria-label={`Include “${r.title}”`}
                  className="mt-2 h-4 w-4 accent-[var(--color-pine)]"
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <textarea
                    value={r.title}
                    rows={1}
                    onChange={(e) => edit(i, { title: e.target.value.replace(/\n/g, "") })}
                    maxLength={200}
                    aria-label={`Task ${i + 1} title`}
                    className="w-full resize-none rounded-md border border-transparent px-1.5 py-1 text-sm font-medium [field-sizing:content] hover:border-line focus:border-line"
                  />
                  {r.description && <p className="px-1.5 text-[13px] text-muted">{r.description}</p>}
                </div>
                <select
                  value={r.priority}
                  onChange={(e) => edit(i, { priority: e.target.value as Priority })}
                  aria-label={`Task ${i + 1} priority`}
                  className="field w-auto py-1 text-[13px]"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABEL[p]}
                    </option>
                  ))}
                </select>
                <span className="w-20 pt-1.5 text-right text-[12px] text-muted">
                  {r.keep && withDates ? `due ${shortDay(due[kept.indexOf(r)])}` : `${r.estimateDays} day${r.estimateDays === 1 ? "" : "s"}`}
                </span>
              </li>
            ))}
          </ol>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={withDates} onChange={(e) => setWithDates(e.target.checked)} className="h-4 w-4 accent-[var(--color-pine)]" />
            Schedule due dates from today, one after another (weekdays only)
          </label>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-between gap-2">
            <Button onClick={reset}>Change goal</Button>
            <Button variant="primary" onClick={add} disabled={adding || !kept.length || kept.some((r) => !r.title.trim())}>
              {adding ? "Adding…" : `Add ${kept.length} task${kept.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
