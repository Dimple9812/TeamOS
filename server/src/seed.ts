import { nanoid } from "nanoid";
import { ORDER_STEP } from "./ordering.js";
import type { Activity, Priority, Project, Store, Task, TaskStatus, User, Workspace } from "./store/types.js";

const DAY = 86_400_000;
export const PROJECT_COLORS = ["#4f46e5", "#0d9488", "#db2777", "#ea580c", "#2563eb", "#7c3aed", "#16a34a", "#ca8a04"];

export const newId = (n = 12) => nanoid(n);
export const inviteCode = () => nanoid(16);

const isoDay = (offsetDays: number, now = Date.now()) => new Date(now + offsetDays * DAY).toISOString().slice(0, 10);

export function newWorkspace(name: string, ownerId: string): Workspace {
  const now = new Date();
  return { id: newId(), name, members: [{ userId: ownerId, role: "owner" }], memberIds: [ownerId], inviteCode: inviteCode(), createdAt: now, updatedAt: now };
}

export function newProject(workspaceId: string, name: string, createdBy: string, color: string, description = ""): Project {
  const now = new Date();
  return { id: newId(), workspaceId, name, description, color, createdBy, createdAt: now, updatedAt: now };
}

export function newTask(p: {
  project: Project; title: string; createdBy: string; status?: TaskStatus; priority?: Priority;
  assigneeId?: string | null; dueDate?: string | null; labels?: string[]; description?: string; order: number; createdAt?: Date;
}): Task {
  const created = p.createdAt ?? new Date();
  const status = p.status ?? "todo";
  return {
    id: newId(),
    workspaceId: p.project.workspaceId,
    projectId: p.project.id,
    title: p.title,
    description: p.description ?? "",
    status,
    priority: p.priority ?? "medium",
    assigneeId: p.assigneeId ?? null,
    dueDate: p.dueDate ?? null,
    labels: p.labels ?? [],
    order: p.order,
    createdBy: p.createdBy,
    completedAt: status === "done" ? new Date(created.getTime() + DAY) : null,
    version: 1,
    createdAt: created,
    updatedAt: created,
  };
}

export function newActivity(a: Omit<Activity, "id" | "createdAt"> & { createdAt?: Date }): Activity {
  return { id: newId(16), createdAt: a.createdAt ?? new Date(), ...a };
}

type Row = [title: string, status: TaskStatus, priority: Priority, who: 0 | 1 | 2 | null, due: number | null, labels: string[], description?: string];

/** A first project for new sign-ups that explains the app by being the app. */
export async function seedGettingStarted(store: Store, user: User) {
  const ws = await store.workspaces.insert(newWorkspace(`${user.name.split(" ")[0]}'s workspace`, user.id));
  const project = await store.projects.insert(newProject(ws.id, "Getting started", user.id, PROJECT_COLORS[0], "A few tasks to learn TeamOS."));
  const rows: [string, TaskStatus, string][] = [
    ["Drag this card to In progress", "todo", "Cards keep their position for everyone on the team."],
    ["Open a card and leave a comment", "todo", "Comments and changes show up live for teammates."],
    ["Try “Break down a goal” with AI", "todo", "Describe an outcome and pick the tasks you want."],
    ["Invite a teammate from Settings", "todo", "Share the invite link; you choose their role."],
    ["Switch to Calendar view and drag a task to a new day", "in_progress", ""],
  ];
  const per: Record<string, number> = {};
  for (const [title, status, description] of rows) {
    per[status] = (per[status] ?? 0) + ORDER_STEP;
    await store.tasks.insert(newTask({ project, title, status, description, createdBy: user.id, assigneeId: user.id, order: per[status], dueDate: isoDay(2) }));
  }
  return ws;
}

/**
 * One-click demo: a guest owner, two teammates and two projects with a realistic spread of work,
 * so every view (board, list, calendar, activity, AI summary, standup) has something to show.
 */
export async function seedDemoWorkspace(store: Store, guest: User) {
  const tag = guest.id.slice(0, 6).toLowerCase();
  const now = Date.now();
  const mates: User[] = [];
  for (const name of ["Priya Sharma", "Arjun Mehta"]) {
    mates.push(
      await store.users.insert({
        id: newId(), name, email: `${name.split(" ")[0].toLowerCase()}-${tag}@demo.teamos.app`, passwordHash: null, isDemo: true, createdAt: new Date(),
      }),
    );
  }
  const people = [guest, ...mates];
  const ws = newWorkspace("Acme Product Team", guest.id);
  ws.members.push({ userId: mates[0].id, role: "admin" }, { userId: mates[1].id, role: "member" });
  ws.memberIds = people.map((p) => p.id);
  await store.workspaces.insert(ws);

  const site = await store.projects.insert(
    newProject(ws.id, "Website relaunch", guest.id, PROJECT_COLORS[0], "New marketing site with pricing, docs and a faster checkout."),
  );
  const app = await store.projects.insert(newProject(ws.id, "Mobile app v2", mates[0].id, PROJECT_COLORS[1], "Offline mode and push notifications."));

  const siteRows: Row[] = [
    ["Finalise homepage copy", "done", "high", 1, -6, ["content"]],
    ["Pick the new type scale and colours", "done", "medium", 0, -5, ["design"]],
    ["Set up analytics events", "done", "medium", 2, -3, ["engineering"]],
    ["Build pricing page", "review", "high", 0, 1, ["engineering"], "Monthly/annual toggle, comparison table, FAQ."],
    ["Write docs landing page", "review", "medium", 1, 2, ["content"]],
    ["Migrate blog posts to the new CMS", "in_progress", "medium", 2, -2, ["engineering"], "42 posts; keep old URLs with redirects."],
    ["Speed up checkout (LCP under 2.5s)", "in_progress", "urgent", 0, 0, ["performance"], "Lazy-load the payment widget and preconnect to the API."],
    ["Accessibility audit (WCAG 2.1 AA)", "in_progress", "high", 1, 3, ["design"]],
    ["Redirect map for old URLs", "todo", "urgent", null, 4, ["engineering"]],
    ["Customer logos and testimonials", "todo", "medium", 1, 5, ["content"]],
    ["Cookie banner and privacy page", "todo", "high", null, 6, ["legal"]],
    ["Load test the launch traffic", "todo", "medium", 2, 8, ["performance"]],
    ["Launch announcement email", "todo", "low", 1, 10, ["marketing"]],
  ];
  const appRows: Row[] = [
    ["Offline cache for the task list", "in_progress", "high", 2, 2, ["engineering"]],
    ["Push notification permissions flow", "todo", "medium", 1, 5, ["design"]],
    ["Crash on Android 12 when rotating", "todo", "urgent", 2, -1, ["bug"]],
    ["App Store screenshots", "todo", "low", null, 12, ["marketing"]],
    ["Sync conflict resolution spec", "done", "high", 0, -4, ["engineering"]],
  ];

  const activity: Activity[] = [];
  const insertRows = async (project: Project, rows: Row[]) => {
    const per: Record<string, number> = {};
    const created: Task[] = [];
    for (const [i, [title, status, priority, who, due, labels, description]] of rows.entries()) {
      per[status] = (per[status] ?? 0) + ORDER_STEP;
      const createdAt = new Date(now - (12 - (i % 6)) * DAY);
      const task = newTask({
        project, title, status, priority, labels, description, order: per[status], createdAt,
        createdBy: people[i % 3].id, assigneeId: who === null ? null : people[who].id, dueDate: due === null ? null : isoDay(due, now),
      });
      if (status === "done") task.completedAt = new Date(now - (2 + (i % 4)) * DAY + 3600_000 * i);
      created.push(await store.tasks.insert(task));
      activity.push(newActivity({
        workspaceId: ws.id, projectId: project.id, taskId: task.id, actorId: task.createdBy, type: "task.created", data: { title }, createdAt,
      }));
      if (status !== "todo") {
        const actor = task.assigneeId ?? task.createdBy;
        const movedAt = status === "done" ? task.completedAt! : new Date(now - DAY + 3600_000 * (i % 9));
        activity.push(newActivity({
          workspaceId: ws.id, projectId: project.id, taskId: task.id, actorId: actor, type: "task.moved",
          data: { title, from: "todo", to: status }, createdAt: movedAt,
        }));
      }
    }
    return created;
  };
  const siteTasks = await insertRows(site, siteRows);
  await insertRows(app, appRows);
  activity.push(
    newActivity({ workspaceId: ws.id, projectId: site.id, taskId: null, actorId: guest.id, type: "project.created", data: { name: site.name }, createdAt: new Date(now - 14 * DAY) }),
    newActivity({ workspaceId: ws.id, projectId: null, taskId: null, actorId: mates[0].id, type: "member.joined", data: {}, createdAt: new Date(now - 13 * DAY) }),
    newActivity({ workspaceId: ws.id, projectId: null, taskId: null, actorId: mates[1].id, type: "member.joined", data: {}, createdAt: new Date(now - 13 * DAY) }),
  );

  const pricing = siteTasks.find((t) => t.title === "Build pricing page")!;
  const checkout = siteTasks.find((t) => t.title.startsWith("Speed up checkout"))!;
  const comments: [Task, User, string, number][] = [
    [pricing, mates[0], "Looks great. Can we default the toggle to annual? That's where most sign-ups come from.", 20],
    [pricing, guest, "Done, and I added the savings badge next to it.", 10],
    [checkout, mates[1], "The payment iframe blocks the main thread for ~600 ms on mid-range phones.", 30],
  ];
  for (const [task, author, body, minutesAgo] of comments) {
    const createdAt = new Date(now - minutesAgo * 60_000);
    await store.comments.insert({ id: newId(), workspaceId: ws.id, projectId: task.projectId, taskId: task.id, authorId: author.id, body, createdAt });
    activity.push(newActivity({ workspaceId: ws.id, projectId: task.projectId, taskId: task.id, actorId: author.id, type: "comment.added", data: { title: task.title }, createdAt }));
  }
  for (const a of activity) await store.activity.insert(a);
  return { workspace: ws, projects: [site, app] };
}
