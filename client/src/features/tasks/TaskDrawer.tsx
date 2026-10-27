import { Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { type TaskPatch, useAddCommentMutation, useCommentsQuery, useDeleteCommentMutation, useDeleteTaskMutation, useUpdateTaskMutation } from "../../app/api";
import { Avatar } from "../../components/ui/Avatar";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { timeAgo } from "../../lib/dates";
import { canManage, type Member, PRIORITIES, PRIORITY_LABEL, type Role, STATUS_LABEL, STATUSES, type Task } from "../../lib/types";
import { ActivityFeed } from "../activity/ActivityFeed";

/** A text field that keeps a local draft and saves on blur (or Enter for single-line). */
function useDraft(value: string, focused: boolean) {
  const [draft, setDraft] = useState(value);
  // Take teammates' live edits unless this field is being typed in.
  useEffect(() => {
    if (!focused) setDraft(value);
  }, [value, focused]);
  return [draft, setDraft] as const;
}

function Comments({ task, meId, role, editable }: { task: Task; meId: string; role: Role; editable: boolean }) {
  const { data: comments = [], isLoading } = useCommentsQuery(task.id);
  const [add, { isLoading: sending }] = useAddCommentMutation();
  const [remove] = useDeleteCommentMutation();
  const [body, setBody] = useState("");

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!body.trim()) return;
    await add({ taskId: task.id, body }).unwrap();
    setBody("");
  };

  return (
    <section aria-labelledby="comments-h">
      <h3 id="comments-h" className="text-sm font-semibold">
        Comments
      </h3>
      {isLoading ? (
        <p className="mt-2 text-sm text-muted">Loading…</p>
      ) : (
        <ol className="mt-3 space-y-4">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-2.5">
              <Avatar id={c.authorId} name={c.authorName} size={26} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px]">
                  <span className="font-semibold">{c.authorName}</span>
                  <span className="ml-2 text-muted">{timeAgo(c.createdAt)}</span>
                  {(c.authorId === meId || canManage(role)) && (
                    <button type="button" onClick={() => remove(c)} className="ml-2 text-muted underline-offset-2 hover:text-danger hover:underline">
                      Delete
                    </button>
                  )}
                </p>
                <p className="mt-0.5 text-sm break-words whitespace-pre-wrap">{c.body}</p>
              </div>
            </li>
          ))}
          {!comments.length && <li className="text-sm text-muted">No comments yet.</li>}
        </ol>
      )}
      {editable && (
        <form onSubmit={submit} className="mt-4">
          <label>
            <span className="sr-only">Write a comment</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
              }}
              rows={3}
              maxLength={4000}
              placeholder="Write a comment… (Ctrl+Enter to send)"
              className="field resize-y text-sm"
            />
          </label>
          <div className="mt-2 flex justify-end">
            <Button type="submit" size="sm" variant="primary" disabled={sending || !body.trim()}>
              Comment
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

export function TaskDrawer({
  task, members, meId, role, editable, onClose, projectName,
}: {
  task: Task | null; members: Member[]; meId: string; role: Role; editable: boolean; onClose: () => void; projectName: string;
}) {
  const [update] = useUpdateTaskMutation();
  const [del] = useDeleteTaskMutation();
  const [focus, setFocus] = useState<"title" | "description" | "labels" | null>(null);
  const [title, setTitle] = useDraft(task?.title ?? "", focus === "title");
  const [description, setDescription] = useDraft(task?.description ?? "", focus === "description");
  const [labels, setLabels] = useDraft(task?.labels.join(", ") ?? "", focus === "labels");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => setConfirmDelete(false), [task?.id]);
  if (!task) return <Modal open={false} onClose={onClose} title="" side children={null} />;

  const save = (patch: TaskPatch) => {
    const changed = Object.entries(patch).some(([k, v]) => JSON.stringify(v) !== JSON.stringify(task[k as keyof Task]));
    if (changed) update({ task, patch });
  };
  const saveTitle = () => {
    setFocus(null);
    const t = title.trim();
    if (!t) return setTitle(task.title);
    save({ title: t });
  };
  const saveLabels = () => {
    setFocus(null);
    const list = [...new Set(labels.split(",").map((l) => l.trim().slice(0, 24)).filter(Boolean))].slice(0, 6);
    save({ labels: list });
  };

  const field = "text-[13px] font-semibold text-muted";
  return (
    <Modal open onClose={onClose} title={projectName} side>
      <div className="space-y-6">
        <label className="block">
          <span className="sr-only">Title</span>
          <textarea
            value={title}
            readOnly={!editable}
            rows={1}
            maxLength={200}
            onFocus={() => setFocus("title")}
            onChange={(e) => setTitle(e.target.value.replace(/\n/g, ""))}
            onBlur={saveTitle}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), e.currentTarget.blur())}
            className="-mx-2 w-[calc(100%+1rem)] resize-none rounded-lg border border-transparent px-2 py-1 text-xl font-semibold [field-sizing:content] hover:border-line focus:border-line"
          />
        </label>

        <dl className="grid grid-cols-[110px_1fr] items-center gap-x-3 gap-y-3 text-sm">
          <dt className={field}>Status</dt>
          <dd>
            <select aria-label="Status" disabled={!editable} value={task.status} onChange={(e) => save({ status: e.target.value as Task["status"] })} className="field py-1">
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </dd>
          <dt className={field}>Assignee</dt>
          <dd>
            <select aria-label="Assignee" disabled={!editable} value={task.assigneeId ?? ""} onChange={(e) => save({ assigneeId: e.target.value || null })} className="field py-1">
              <option value="">Unassigned</option>
              {members
                .filter((m) => m.role !== "viewer" || m.userId === task.assigneeId)
                .map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name}
                    {m.userId === meId ? " (me)" : ""}
                  </option>
                ))}
            </select>
          </dd>
          <dt className={field}>Priority</dt>
          <dd>
            <select aria-label="Priority" disabled={!editable} value={task.priority} onChange={(e) => save({ priority: e.target.value as Task["priority"] })} className="field py-1">
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </dd>
          <dt className={field}>Due date</dt>
          <dd>
            <input aria-label="Due date" type="date" disabled={!editable} value={task.dueDate ?? ""} onChange={(e) => save({ dueDate: e.target.value || null })} className="field py-1" />
          </dd>
          <dt className={field}>Labels</dt>
          <dd>
            <input
              aria-label="Labels"
              readOnly={!editable}
              value={labels}
              placeholder="design, launch"
              onFocus={() => setFocus("labels")}
              onChange={(e) => setLabels(e.target.value)}
              onBlur={saveLabels}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              className="field py-1"
            />
          </dd>
        </dl>

        <label className="block">
          <span className={field}>Description</span>
          <textarea
            value={description}
            readOnly={!editable}
            rows={5}
            maxLength={5000}
            placeholder={editable ? "Add details, links or acceptance criteria" : "No description"}
            onFocus={() => setFocus("description")}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => {
              setFocus(null);
              save({ description });
            }}
            className="field mt-1 resize-y text-sm"
          />
        </label>

        <Comments task={task} meId={meId} role={role} editable={editable} />

        <section aria-labelledby="history-h">
          <h3 id="history-h" className="text-sm font-semibold">
            History
          </h3>
          <div className="mt-3">
            <ActivityFeed workspaceId={task.workspaceId} taskId={task.id} limit={15} compact />
          </div>
        </section>

        {editable && (
          <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
            {confirmDelete ? (
              <>
                <span className="mr-auto text-sm">Delete this task and its comments?</span>
                <Button size="sm" onClick={() => setConfirmDelete(false)}>
                  Keep it
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    del(task);
                    onClose();
                  }}
                >
                  Delete task
                </Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)} className="text-danger">
                <Trash2 size={14} /> Delete task
              </Button>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
