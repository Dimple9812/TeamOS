import { Plus } from "lucide-react";
import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useProjectsQuery } from "../app/api";
import { useAppSelector } from "../app/hooks";
import { Avatar } from "../components/ui/Avatar";
import { Button } from "../components/ui/Button";
import { ActivityFeed } from "../features/activity/ActivityFeed";
import { StandupCard } from "../features/ai/StandupCard";
import { useShell } from "../features/workspace/context";
import { STATUS_COLOR, canEdit, type Project } from "../lib/types";

function ProjectRow({ project, workspaceId }: { project: Project; workspaceId: string }) {
  const s = project.stats;
  const segments = s ? ([["done", s.done], ["review", s.review], ["in_progress", s.inProgress], ["todo", s.todo]] as const) : [];
  return (
    <li>
      <Link to={`/w/${workspaceId}/p/${project.id}`} className="block rounded-xl border border-line bg-surface p-4 hover:border-line-strong">
        <div className="flex items-baseline justify-between gap-3">
          <p className="flex items-center gap-2 font-semibold">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: project.color }} aria-hidden="true" />
            {project.name}
          </p>
          {s && <p className="text-[13px] text-muted">{s.percentDone}% done</p>}
        </div>
        {s && s.total > 0 && (
          <div className="mt-2.5 flex h-1.5 gap-px overflow-hidden rounded-full bg-line" aria-hidden="true">
            {segments.map(([k, n]) => (n ? <span key={k} style={{ width: `${(n / s.total) * 100}%`, background: STATUS_COLOR[k] }} /> : null))}
          </div>
        )}
        {s && (
          <p className="mt-2.5 text-[13px] text-muted">
            {s.total} tasks
            {s.overdue > 0 && <span className="font-semibold text-danger">, {s.overdue} overdue</span>}
            {s.dueThisWeek > 0 && `, ${s.dueThisWeek} due this week`}
          </p>
        )}
      </Link>
    </li>
  );
}

export default function WorkspaceHome() {
  const { workspace, me, openNewProject } = useShell();
  const projects = useProjectsQuery(workspace.id);
  const presence = useAppSelector((s) => s.ui.presence);
  const names = useMemo(() => new Map((projects.data ?? []).map((p) => [p.id, p.name])), [projects.data]);
  const online = presence.workspaceId === workspace.id ? presence.users.filter((u) => u.userId !== me.id) : [];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  useEffect(() => {
    document.title = `${workspace.name} – TeamOS`;
  }, [workspace.name]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8 lg:py-8">
      <h1 className="text-2xl font-semibold">
        {greeting}, {me.name.replace(/\s*\(.*\)$/, "").split(" ")[0]}
      </h1>
      <p className="mt-1 text-muted">
        {workspace.name} has {workspace.members.length} member{workspace.members.length === 1 ? "" : "s"}
        {online.length > 0 && <>; {online.map((u) => u.name).join(", ")} {online.length === 1 ? "is" : "are"} online now</>}.
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="space-y-8">
          <section aria-labelledby="projects-h">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="projects-h" className="text-[17px] font-semibold">
                Projects
              </h2>
              {canEdit(workspace.role) && (
                <Button size="sm" onClick={openNewProject}>
                  <Plus size={15} /> New project
                </Button>
              )}
            </div>
            {projects.data?.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line-strong p-8 text-center">
                <p className="font-semibold">No projects yet</p>
                <p className="mt-1 text-sm text-muted">Create one to start a board for your team.</p>
                {canEdit(workspace.role) && (
                  <Button variant="primary" className="mt-4" onClick={openNewProject}>
                    Create a project
                  </Button>
                )}
              </div>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {projects.data?.map((p) => (
                  <ProjectRow key={p.id} project={p} workspaceId={workspace.id} />
                ))}
              </ul>
            )}
          </section>
          <StandupCard workspaceId={workspace.id} />
        </div>

        <section aria-labelledby="activity-h">
          <h2 id="activity-h" className="mb-3 text-[17px] font-semibold">
            Recent activity
          </h2>
          <div className="rounded-xl border border-line bg-surface p-5">
            <ActivityFeed workspaceId={workspace.id} projectNames={names} limit={25} />
          </div>
          {online.length > 0 && (
            <div className="mt-4 flex items-center gap-2 text-sm text-muted">
              <div className="flex -space-x-1.5">
                {online.map((u) => (
                  <Avatar key={u.userId} id={u.userId} name={u.name} size={24} ring />
                ))}
              </div>
              online
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
