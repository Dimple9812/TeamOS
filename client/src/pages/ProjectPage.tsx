import clsx from "clsx";
import { CalendarDays, Columns3, FileText, List, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { useProjectsQuery, useTasksQuery } from "../app/api";
import { useAppSelector } from "../app/hooks";
import { Avatar } from "../components/ui/Avatar";
import { Button } from "../components/ui/Button";
import { BreakdownModal } from "../features/ai/BreakdownModal";
import { SummaryModal } from "../features/ai/SummaryModal";
import { BoardView } from "../features/board/BoardView";
import { StatusRibbon } from "../features/board/StatusRibbon";
import { CalendarView } from "../features/tasks/CalendarView";
import { FilterBar } from "../features/tasks/FilterBar";
import { ListView } from "../features/tasks/ListView";
import { TaskDrawer } from "../features/tasks/TaskDrawer";
import { memberNames, useShell } from "../features/workspace/context";
import { applyFilter, readFilter } from "../lib/filters";
import { canEdit } from "../lib/types";

type View = "board" | "list" | "calendar";
const VIEWS: { id: View; label: string; icon: typeof Columns3 }[] = [
  { id: "board", label: "Board", icon: Columns3 },
  { id: "list", label: "List", icon: List },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
];

export default function ProjectPage() {
  const { projectId = "" } = useParams();
  const { workspace, me } = useShell();
  const [params, setParams] = useSearchParams();
  const projects = useProjectsQuery(workspace.id);
  const tasks = useTasksQuery(projectId);
  const presence = useAppSelector((s) => s.ui.presence);
  const [ai, setAi] = useState<"breakdown" | "summary" | null>(null);

  const view = (params.get("view") as View) || "board";
  const openTaskId = params.get("task");
  const project = projects.data?.find((p) => p.id === projectId);
  const editable = canEdit(workspace.role);
  const names = useMemo(() => memberNames(workspace), [workspace]);
  const filter = readFilter(params);
  const all = useMemo(() => tasks.data ?? [], [tasks.data]);
  const visible = useMemo(() => applyFilter(all, filter, me.id), [all, filter.q, filter.assignee, filter.priority, me.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const openTask = openTaskId ? (all.find((t) => t.id === openTaskId) ?? null) : null;
  const here = presence.workspaceId === workspace.id ? presence.users.filter((u) => u.projectId === projectId) : [];

  useEffect(() => {
    if (project) document.title = `${project.name} – TeamOS`;
  }, [project]);

  const setParam = (key: string, value: string | null) =>
    setParams((p) => {
      if (value) p.set(key, value);
      else p.delete(key);
      return p;
    });

  if (projects.isSuccess && !project) return <Navigate to={`/w/${workspace.id}`} replace />;
  if (!project) return null;

  return (
    <div className="flex h-full flex-col">
      <header className="space-y-4 px-4 pt-5 pb-4 lg:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2.5 text-2xl font-semibold">
              <span className="h-3 w-3 shrink-0 rounded" style={{ background: project.color }} aria-hidden="true" />
              <span className="truncate">{project.name}</span>
            </h1>
            {project.description && <p className="mt-1 max-w-2xl text-muted">{project.description}</p>}
          </div>
          <div className="flex items-center gap-2">
            {here.length > 0 && (
              <div className="mr-1 flex -space-x-1.5" aria-label={`Viewing now: ${here.map((u) => u.name).join(", ")}`}>
                {here.map((u) => (
                  <Avatar key={u.userId} id={u.userId} name={u.userId === me.id ? `${u.name} (you)` : u.name} size={28} ring />
                ))}
              </div>
            )}
            <Button size="sm" onClick={() => setAi("summary")}>
              <FileText size={15} /> Summarise
            </Button>
            {editable && (
              <Button size="sm" variant="primary" onClick={() => setAi("breakdown")}>
                <Sparkles size={15} /> Break down a goal
              </Button>
            )}
          </div>
        </div>
        <StatusRibbon tasks={all} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="tablist" aria-label="View" className="inline-flex rounded-lg border border-line bg-surface p-0.5">
            {VIEWS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                role="tab"
                type="button"
                aria-selected={view === id}
                onClick={() => setParam("view", id === "board" ? null : id)}
                className={clsx(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-semibold",
                  view === id ? "bg-pine text-white" : "text-muted hover:text-ink",
                )}
              >
                <Icon size={15} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
          <FilterBar members={workspace.members} meId={me.id} />
        </div>
        {!editable && <p className="rounded-lg bg-pine-soft px-3 py-2 text-sm text-pine-dark">You're a viewer in this workspace, so you can look but not change anything.</p>}
      </header>

      <div className="min-h-0 flex-1" role="tabpanel" aria-label={`${view} view`}>
        {tasks.isLoading ? (
          <p className="px-6 text-muted">Loading tasks…</p>
        ) : view === "list" ? (
          <ListView tasks={visible} names={names} onOpen={(id) => setParam("task", id)} editable={editable} />
        ) : view === "calendar" ? (
          <CalendarView tasks={visible} onOpen={(id) => setParam("task", id)} editable={editable} />
        ) : (
          <BoardView tasks={visible} allTasks={all} names={names} onOpen={(id) => setParam("task", id)} editable={editable} projectId={projectId} />
        )}
      </div>

      <TaskDrawer
        task={openTask}
        members={workspace.members}
        meId={me.id}
        role={workspace.role}
        editable={editable}
        projectName={project.name}
        onClose={() => setParam("task", null)}
      />
      <BreakdownModal projectId={projectId} open={ai === "breakdown"} onClose={() => setAi(null)} />
      <SummaryModal projectId={projectId} open={ai === "summary"} onClose={() => setAi(null)} />
    </div>
  );
}
