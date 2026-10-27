import clsx from "clsx";
import { Home, LogOut, Menu, Plus, Settings, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  api, errorMessage, useCreateWorkspaceMutation, useLogoutMutation, useMeQuery, useProjectsQuery, useWorkspaceQuery, useWorkspacesQuery,
} from "../app/api";
import { useAppDispatch, useAppSelector } from "../app/hooks";
import { disconnectRealtime, useRealtime } from "../app/realtime";
import { Avatar } from "../components/ui/Avatar";
import { Button } from "../components/ui/Button";
import { Logo } from "../components/ui/Logo";
import { Modal } from "../components/ui/Modal";
import { WakingServer } from "../components/ui/WakingServer";
import { NewProjectModal } from "../features/workspace/NewProjectModal";
import type { ShellContext } from "../features/workspace/context";
import { canEdit } from "../lib/types";

function NewWorkspaceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [create, { isLoading }] = useCreateWorkspaceMutation();
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const ws = await create(String(new FormData(e.currentTarget).get("name"))).unwrap();
      onClose();
      navigate(`/w/${ws.id}`);
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="New workspace">
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="text-sm font-semibold">Name</span>
          <input name="name" required maxLength={60} autoFocus className="field mt-1" placeholder="e.g. Design team" />
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={isLoading}>
            Create workspace
          </Button>
        </div>
      </form>
    </Modal>
  );
}

const CONNECTION_LABEL = { live: "Live", connecting: "Reconnecting…", offline: "Offline" } as const;

export default function AppShell() {
  const { workspaceId = "", projectId = null } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();
  const me = useMeQuery().data!;
  const workspaces = useWorkspacesQuery();
  const workspace = useWorkspaceQuery(workspaceId);
  const projects = useProjectsQuery(workspaceId);
  const presence = useAppSelector((s) => s.ui.presence);
  const connection = useAppSelector((s) => s.ui.connection);
  const [logout] = useLogoutMutation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [newProject, setNewProject] = useState(false);
  const [newWorkspace, setNewWorkspace] = useState(false);

  useRealtime(workspace.data ? workspaceId : undefined, projectId);
  useEffect(() => setMenuOpen(false), [location.pathname]);

  // Removed from the workspace, or a stale link: go somewhere that works.
  useEffect(() => {
    if (workspace.isError) navigate("/app", { replace: true });
  }, [workspace.isError, navigate]);

  if (!workspace.data) return <WakingServer seconds={null} failed={false} />;
  const ws = workspace.data;
  const online = presence.workspaceId === workspaceId ? presence.users : [];

  const signOut = async () => {
    await logout();
    disconnectRealtime();
    dispatch(api.util.resetApiState());
    navigate("/");
  };

  const context: ShellContext = { workspace: ws, me, openNewProject: () => setNewProject(true) };

  const sidebar = (
    <div className="flex h-full flex-col gap-5 p-4">
      <div className="flex items-center justify-between">
        <NavLink to="/app" aria-label="TeamOS home">
          <Logo />
        </NavLink>
        <button type="button" className="rounded-md p-1 lg:hidden" aria-label="Close menu" onClick={() => setMenuOpen(false)}>
          <X size={20} />
        </button>
      </div>

      <label className="block">
        <span className="sr-only">Workspace</span>
        <select
          className="field font-semibold"
          value={workspaceId}
          onChange={(e) => (e.target.value === "__new" ? setNewWorkspace(true) : navigate(`/w/${e.target.value}`))}
        >
          {workspaces.data?.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
          <option value="__new">+ New workspace…</option>
        </select>
      </label>

      <nav aria-label="Workspace" className="flex flex-col gap-0.5">
        <NavItem to={`/w/${workspaceId}`} end icon={<Home size={16} />}>
          Overview
        </NavItem>
        <NavItem to={`/w/${workspaceId}/settings`} icon={<Settings size={16} />}>
          Members & settings
        </NavItem>
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mb-1 flex items-center justify-between px-2">
          <h2 className="text-[13px] font-semibold text-muted">Projects</h2>
          {canEdit(ws.role) && (
            <button type="button" aria-label="New project" onClick={() => setNewProject(true)} className="rounded-md p-1 text-muted hover:bg-ink/5 hover:text-ink">
              <Plus size={16} />
            </button>
          )}
        </div>
        <nav aria-label="Projects" className="flex flex-col gap-0.5">
          {projects.data?.map((p) => {
            const here = online.filter((u) => u.projectId === p.id && u.userId !== me.id);
            return (
              <NavItem key={p.id} to={`/w/${workspaceId}/p/${p.id}`} icon={<span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />}>
                <span className="flex-1 truncate">{p.name}</span>
                {here.length > 0 && <span className="h-2 w-2 rounded-full bg-st-done" title={`${here.map((u) => u.name).join(", ")} here now`} />}
              </NavItem>
            );
          })}
          {projects.data?.length === 0 && <p className="px-2 text-[13px] text-muted">No projects yet.</p>}
        </nav>
      </div>

      <div className="space-y-3 border-t border-line pt-4">
        <div className="flex items-center justify-between">
          <div className="flex -space-x-1.5" aria-label={`${online.length} online`}>
            {online.slice(0, 6).map((u) => (
              <Avatar key={u.userId} id={u.userId} name={u.userId === me.id ? `${u.name}` : u.name} size={24} ring />
            ))}
          </div>
          <span className="flex items-center gap-1.5 text-[12px] text-muted" role="status">
            <span className={clsx("h-2 w-2 rounded-full", connection === "live" ? "bg-st-done" : connection === "connecting" ? "bg-st-progress" : "bg-danger")} />
            {CONNECTION_LABEL[connection]}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Avatar id={me.id} name={me.name} size={28} />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{me.name}</span>
          <button type="button" onClick={signOut} aria-label="Sign out" title="Sign out" className="rounded-md p-1.5 text-muted hover:bg-ink/5 hover:text-ink">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-full">
      <aside className="hidden w-64 shrink-0 border-r border-line bg-surface lg:block">{sidebar}</aside>
      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-ink/30" onClick={() => setMenuOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-surface shadow-[var(--shadow-panel)]">{sidebar}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-line bg-surface px-4 py-2.5 lg:hidden">
          <button type="button" aria-label="Open menu" onClick={() => setMenuOpen(true)} className="rounded-md p-1">
            <Menu size={20} />
          </button>
          <Logo compact />
          <span className="truncate font-semibold">{ws.name}</span>
        </div>
        <main id="main" className="min-h-0 flex-1 overflow-y-auto">
          <Outlet context={context} />
        </main>
      </div>
      <NewProjectModal workspaceId={workspaceId} open={newProject} onClose={() => setNewProject(false)} />
      <NewWorkspaceModal open={newWorkspace} onClose={() => setNewWorkspace(false)} />
    </div>
  );
}

function NavItem({ to, end, icon, children }: { to: string; end?: boolean; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        clsx("flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm", isActive ? "bg-pine-soft font-semibold text-pine-dark" : "text-ink hover:bg-ink/5")
      }
    >
      <span className="flex w-4 justify-center text-muted">{icon}</span>
      {children}
    </NavLink>
  );
}
