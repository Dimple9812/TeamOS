import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { errorMessage, useRemoveMemberMutation, useRenameWorkspaceMutation, useRotateInviteMutation, useSetMemberRoleMutation } from "../app/api";
import { useAppDispatch } from "../app/hooks";
import { toast } from "../app/uiSlice";
import { Avatar } from "../components/ui/Avatar";
import { Button } from "../components/ui/Button";
import { useShell } from "../features/workspace/context";
import { canManage, type Member, type Role } from "../lib/types";

const ROLE_HELP: Record<Role, string> = {
  owner: "Everything, including managing admins",
  admin: "Manage members, projects and the invite link",
  member: "Create and edit tasks, comment",
  viewer: "Read only",
};

/** Mirrors the server's rules so the UI only offers changes that will succeed. */
function canChange(actor: Role, target: Member, meId: string) {
  if (target.role === "owner" || target.userId === meId) return false;
  if (actor === "owner") return true;
  return actor === "admin" && target.role !== "admin";
}

export default function SettingsPage() {
  const { workspace, me } = useShell();
  const [rename, renameState] = useRenameWorkspaceMutation();
  const [rotate, rotateState] = useRotateInviteMutation();
  const [setRole] = useSetMemberRoleMutation();
  const [remove] = useRemoveMemberMutation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const manage = canManage(workspace.role);
  const inviteUrl = workspace.inviteCode ? `${location.origin}/join/${workspace.inviteCode}` : null;

  const run = async (p: Promise<unknown>, done?: string) => {
    try {
      await p;
      if (done) dispatch(toast(done, "success"));
    } catch (e) {
      dispatch(toast(errorMessage(e), "error"));
    }
  };

  const submitName = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    run(rename({ id: workspace.id, name: String(new FormData(e.currentTarget).get("name")) }).unwrap(), "Workspace renamed.");
  };

  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-6 lg:px-8 lg:py-8">
      <h1 className="text-2xl font-semibold">Members & settings</h1>

      {manage && (
        <section aria-labelledby="name-h" className="space-y-3">
          <h2 id="name-h" className="text-[17px] font-semibold">
            Workspace name
          </h2>
          <form onSubmit={submitName} className="flex max-w-md gap-2">
            <label className="flex-1">
              <span className="sr-only">Workspace name</span>
              <input name="name" defaultValue={workspace.name} required maxLength={60} className="field" />
            </label>
            <Button type="submit" disabled={renameState.isLoading}>
              Rename
            </Button>
          </form>
        </section>
      )}

      {manage && inviteUrl && (
        <section aria-labelledby="invite-h" className="space-y-3">
          <h2 id="invite-h" className="text-[17px] font-semibold">
            Invite people
          </h2>
          <p className="text-sm text-muted">Anyone with this link can join as a member. You can change their role after they join.</p>
          <div className="flex flex-wrap gap-2">
            <input readOnly value={inviteUrl} aria-label="Invite link" className="field max-w-md flex-1 text-sm" onFocus={(e) => e.currentTarget.select()} />
            <Button
              variant="primary"
              onClick={async () => {
                await navigator.clipboard.writeText(inviteUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? "Copied" : "Copy link"}
            </Button>
            <Button variant="ghost" disabled={rotateState.isLoading} onClick={() => run(rotate(workspace.id).unwrap(), "New invite link created. The old one no longer works.")}>
              Reset link
            </Button>
          </div>
        </section>
      )}

      <section aria-labelledby="members-h" className="space-y-3">
        <h2 id="members-h" className="text-[17px] font-semibold">
          Members
        </h2>
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {workspace.members.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Avatar id={m.userId} name={m.name} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {m.name}
                  {m.userId === me.id && <span className="font-normal text-muted"> (you)</span>}
                </p>
                <p className="truncate text-[13px] text-muted">{m.email}</p>
              </div>
              {canChange(workspace.role, m, me.id) ? (
                <>
                  <label>
                    <span className="sr-only">Role for {m.name}</span>
                    <select
                      value={m.role}
                      onChange={(e) => run(setRole({ workspaceId: workspace.id, userId: m.userId, role: e.target.value as Exclude<Role, "owner"> }).unwrap())}
                      className="field w-auto py-1 text-sm"
                    >
                      {workspace.role === "owner" && <option value="admin">Admin</option>}
                      <option value="member">Member</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  </label>
                  <Button size="sm" variant="ghost" className="text-danger" onClick={() => run(remove({ workspaceId: workspace.id, userId: m.userId }).unwrap(), `${m.name} was removed.`)}>
                    Remove
                  </Button>
                </>
              ) : (
                <span className="text-sm text-muted capitalize" title={ROLE_HELP[m.role]}>
                  {m.role}
                </span>
              )}
            </li>
          ))}
        </ul>
        <dl className="grid gap-x-4 gap-y-1 text-[13px] sm:grid-cols-[80px_1fr]">
          {(Object.keys(ROLE_HELP) as Role[]).map((r) => (
            <div key={r} className="contents">
              <dt className="font-semibold capitalize">{r}</dt>
              <dd className="text-muted">{ROLE_HELP[r]}</dd>
            </div>
          ))}
        </dl>
      </section>

      {workspace.role !== "owner" && (
        <section aria-labelledby="leave-h" className="space-y-3">
          <h2 id="leave-h" className="text-[17px] font-semibold">
            Leave workspace
          </h2>
          <p className="text-sm text-muted">Your tasks here will become unassigned.</p>
          <Button
            variant="danger"
            onClick={async () => {
              await run(remove({ workspaceId: workspace.id, userId: me.id }).unwrap(), `You left ${workspace.name}.`);
              navigate("/app");
            }}
          >
            Leave {workspace.name}
          </Button>
        </section>
      )}
    </div>
  );
}
