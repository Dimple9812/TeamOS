import { Link } from "react-router-dom";
import { useActivityQuery } from "../../app/api";
import { Avatar } from "../../components/ui/Avatar";
import { timeAgo } from "../../lib/dates";
import { type Activity, STATUS_LABEL, type TaskStatus } from "../../lib/types";

export function describe(a: Activity): string {
  const title = typeof a.data.title === "string" ? `“${a.data.title}”` : "a task";
  switch (a.type) {
    case "task.created":
      return `created ${title}`;
    case "task.moved":
      return `moved ${title} to ${STATUS_LABEL[a.data.to as TaskStatus] ?? a.data.to}`;
    case "task.assigned":
      return a.data.assignee ? `assigned ${title} to ${a.data.assignee}` : `unassigned ${title}`;
    case "task.updated": {
      const fields = (a.data.fields as string[] | undefined) ?? [];
      const what = fields.includes("dueDate") && fields.length === 1 ? "changed the due date of" : fields.includes("priority") && fields.length === 1 ? "changed the priority of" : "edited";
      return `${what} ${title}`;
    }
    case "task.deleted":
      return `deleted ${title}`;
    case "comment.added":
      return `commented on ${title}`;
    case "member.joined":
      return "joined the workspace";
    case "project.created":
      return `created the project “${a.data.name}”`;
    case "ai.tasks_created":
      return `added ${a.data.count} tasks from AI planning`;
    default:
      return "made a change";
  }
}

export function ActivityFeed({
  workspaceId,
  projectId,
  taskId,
  limit = 30,
  projectNames,
  compact = false,
}: {
  workspaceId: string;
  projectId?: string;
  taskId?: string;
  limit?: number;
  projectNames?: Map<string, string>;
  compact?: boolean;
}) {
  const { data, isLoading } = useActivityQuery({ workspaceId, projectId, taskId, limit });
  if (isLoading) return <p className="text-sm text-muted">Loading activity…</p>;
  if (!data?.length) return <p className="text-sm text-muted">Nothing has happened here yet.</p>;
  return (
    <ol className="space-y-3" aria-label="Activity">
      {data.map((a) => (
        <li key={a.id} className="flex gap-2.5 text-sm">
          {!compact && <Avatar id={a.actorId} name={a.actorName} size={22} className="mt-0.5" />}
          <p className="min-w-0 flex-1">
            <span className="font-semibold">{a.actorName}</span> {describe(a)}
            {projectNames && a.projectId && projectNames.get(a.projectId) && (
              <>
                {" in "}
                <Link to={`/w/${workspaceId}/p/${a.projectId}`} className="text-pine underline-offset-2 hover:underline">
                  {projectNames.get(a.projectId)}
                </Link>
              </>
            )}
            <span className="ml-1.5 text-[12px] whitespace-nowrap text-muted">{timeAgo(a.createdAt)}</span>
          </p>
        </li>
      ))}
    </ol>
  );
}
