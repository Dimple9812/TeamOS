import express, { type NextFunction, type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import cors from "cors";
import { rateLimit } from "express-rate-limit";
import { nanoid } from "nanoid";
import { z } from "zod";
import type { Config } from "./config.js";
import type { Broadcaster } from "./realtime.js";
import type { AiService } from "./ai/service.js";
import { projectStats } from "./ai/service.js";
import {
  clearSessionCookie, hashPassword, publicUser, requireAuth, setSessionCookie, signSession, signSocketToken, verifyPassword,
} from "./auth.js";
import { needsRespace, orderBetween, respaced } from "./ordering.js";
import {
  inviteCode, newActivity, newId, newProject, newTask, newWorkspace, PROJECT_COLORS, seedDemoWorkspace, seedGettingStarted,
} from "./seed.js";
import {
  type Activity, type ActivityType, atLeast, type Comment, PRIORITIES, type Project, type Role, roleOf, ROLES, STATUSES,
  type Store, type Task, type TaskStatus, type User, type Workspace,
} from "./store/types.js";

export interface AppDeps {
  config: Config;
  store: Store;
  ai: AiService;
  realtime: Broadcaster;
}

// ---------- Validation ----------
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date");
const credentials = z.object({
  email: z.email().max(150).transform((e) => e.toLowerCase()),
  password: z.string().min(8, "Password must be at least 8 characters").max(100),
});
const signup = credentials.extend({ name: z.string().trim().min(1, "Enter your name").max(60) });
const workspaceBody = z.object({ name: z.string().trim().min(1, "Name the workspace").max(60) });
const projectBody = z.object({
  name: z.string().trim().min(1, "Name the project").max(80),
  description: z.string().trim().max(500).optional(),
  color: z.enum(PROJECT_COLORS).optional(),
});
const labels = z.array(z.string().trim().min(1).max(24)).max(6);
const taskFields = {
  title: z.string().trim().min(1, "Give the task a title").max(200),
  description: z.string().max(5000),
  status: z.enum(STATUSES),
  priority: z.enum(PRIORITIES),
  assigneeId: z.string().max(32).nullable(),
  dueDate: day.nullable(),
  labels,
};
const taskCreate = z.object({
  title: taskFields.title,
  description: taskFields.description.default(""),
  status: taskFields.status.default("todo"),
  priority: taskFields.priority.default("medium"),
  assigneeId: taskFields.assigneeId.default(null),
  dueDate: taskFields.dueDate.default(null),
  labels: labels.default([]),
});
const taskPatch = z
  .object({ ...taskFields, version: z.number().int().min(1) })
  .partial()
  .required({ version: true });
const taskMove = z.object({
  status: z.enum(STATUSES),
  /** The card that will sit directly above / below the moved card. */
  prevId: z.string().max(32).nullable().default(null),
  nextId: z.string().max(32).nullable().default(null),
});
const bulkCreate = z.object({
  goal: z.string().trim().max(500).optional(),
  tasks: z
    .array(z.object({ title: taskFields.title, description: z.string().max(400).default(""), priority: taskFields.priority.default("medium"), dueDate: day.nullable().default(null) }))
    .min(1)
    .max(15),
});
const commentBody = z.object({ body: z.string().trim().min(1, "Write something first").max(4000) });
const memberRole = z.object({ role: z.enum(ROLES.filter((r) => r !== "owner") as ["admin", "member", "viewer"]) });
const joinBody = z.object({ code: z.string().min(8).max(64) });
const goalBody = z.object({ goal: z.string().trim().min(5, "Describe the goal in a few words").max(500) });
const todayQuery = z.object({ today: day.optional() });

class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public extra?: Record<string, unknown>) {
    super(message);
  }
}
const asyncRoute = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) =>
  fn(req, res).catch(next);
const notFound = (what: string) => new HttpError(404, "NOT_FOUND", `${what} not found.`);
const forbid = (message: string) => new HttpError(403, "FORBIDDEN", message);
const serverToday = () => new Date().toISOString().slice(0, 10);

export function createApp({ config, store, ai, realtime }: AppDeps) {
  const app = express();
  app.set("trust proxy", config.trustProxyHops);
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: config.clientOrigins, credentials: true }));
  app.use(express.json({ limit: "64kb" }));
  app.use(cookieParser());

  const limiter = (limit: number, message: string) =>
    rateLimit({ windowMs: 60_000, limit, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "RATE_LIMITED", message } });
  const authLimiter = limiter(config.authRateLimit, "Too many attempts. Try again in a minute.");
  const aiLimiter = limiter(20, "Slow down — too many AI requests this minute.");
  const auth = requireAuth(config);

  // ---------- Shared helpers ----------
  const names = async (ids: Iterable<string>) => {
    const unique = [...new Set(ids)];
    const users = unique.length ? await store.users.find({ id: { $in: unique } }) : [];
    return new Map(users.map((u) => [u.id, u.name]));
  };

  /** Loads a workspace the caller belongs to. Non-members get 404 so ids can't be probed. */
  const loadWorkspace = async (req: Request, id: string) => {
    const ws = await store.workspaces.get(id);
    const role = ws ? roleOf(ws, req.userId!) : null;
    if (!ws || !role) throw notFound("Workspace");
    return { ws, role };
  };
  const loadProject = async (req: Request) => {
    const project = await store.projects.get(String(req.params.pid));
    if (!project) throw notFound("Project");
    const { ws, role } = await loadWorkspace(req, project.workspaceId).catch(() => {
      throw notFound("Project");
    });
    return { project, ws, role };
  };
  const loadTask = async (req: Request) => {
    const task = await store.tasks.get(String(req.params.tid));
    if (!task) throw notFound("Task");
    const { ws, role } = await loadWorkspace(req, task.workspaceId).catch(() => {
      throw notFound("Task");
    });
    return { task, ws, role };
  };
  const need = (role: Role, min: Role, message: string) => {
    if (!atLeast(role, min)) throw forbid(message);
  };
  const canEdit = (role: Role) => need(role, "member", "Viewers can look but not change anything.");

  const record = async (a: { ws: Workspace; actor: string; type: ActivityType; projectId?: string | null; taskId?: string | null; data?: Record<string, unknown> }) => {
    const activity = await store.activity.insert(
      newActivity({ workspaceId: a.ws.id, projectId: a.projectId ?? null, taskId: a.taskId ?? null, actorId: a.actor, type: a.type, data: a.data ?? {} }),
    );
    const n = await names([a.actor]);
    realtime.toWorkspace(a.ws.id, "activity:new", { activity: { ...activity, actorName: n.get(a.actor) ?? "Someone" } });
    return activity;
  };
  const pushTask = (task: Task) => realtime.toWorkspace(task.workspaceId, "task:upsert", { task });

  const assertAssignee = (ws: Workspace, assigneeId: string | null | undefined) => {
    if (assigneeId && !ws.memberIds.includes(assigneeId)) throw new HttpError(400, "VALIDATION", "The assignee isn't in this workspace.");
  };

  /** Order value that puts a card at the bottom of a column. */
  const bottomOf = async (projectId: string, status: TaskStatus) => {
    const [last] = await store.tasks.find({ projectId, status }, { sort: "order", desc: true, limit: 1 });
    return orderBetween(last?.order ?? null, null);
  };

  const workspaceDetails = async (ws: Workspace, userId: string) => {
    const role = roleOf(ws, userId)!;
    const users = await store.users.find({ id: { $in: ws.memberIds } });
    const byId = new Map(users.map((u) => [u.id, u]));
    return {
      id: ws.id,
      name: ws.name,
      role,
      // The invite link is only shown to people who can manage members.
      inviteCode: atLeast(role, "admin") ? ws.inviteCode : null,
      members: ws.members.map((m) => ({ userId: m.userId, role: m.role, name: byId.get(m.userId)?.name ?? "Unknown", email: byId.get(m.userId)?.email ?? "" })),
      createdAt: ws.createdAt,
    };
  };

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, store: config.store, ai: ai.status().provider });
  });

  // ---------- Auth ----------
  app.post("/api/auth/signup", authLimiter, asyncRoute(async (req, res) => {
    const body = signup.parse(req.body);
    if ((await store.users.count({ email: body.email })) > 0) throw new HttpError(409, "EMAIL_TAKEN", "An account with this email already exists.");
    const user = await store.users.insert({
      id: newId(), email: body.email, name: body.name, passwordHash: await hashPassword(body.password), isDemo: false, createdAt: new Date(),
    });
    const ws = await seedGettingStarted(store, user);
    setSessionCookie(config, res, signSession(config, user.id));
    res.status(201).json({ user: publicUser(user), workspaceId: ws.id });
  }));

  app.post("/api/auth/login", authLimiter, asyncRoute(async (req, res) => {
    const body = credentials.parse(req.body);
    const [user] = await store.users.find({ email: body.email }, { limit: 1 });
    const ok = user?.passwordHash ? await verifyPassword(body.password, user.passwordHash) : false;
    // Same message either way, so the endpoint doesn't reveal which emails are registered.
    if (!user || !ok) throw new HttpError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
    setSessionCookie(config, res, signSession(config, user.id));
    res.json({ user: publicUser(user) });
  }));

  /** One-click demo: a fresh guest with a fully populated team workspace, so visitors never collide. */
  app.post("/api/auth/demo", authLimiter, asyncRoute(async (_req, res) => {
    const tag = nanoid(6).toLowerCase();
    const user: User = { id: newId(), email: `guest-${tag}@demo.teamos.app`, name: "Guest", passwordHash: null, isDemo: true, createdAt: new Date() };
    await store.users.insert(user);
    const { workspace, projects } = await seedDemoWorkspace(store, user);
    setSessionCookie(config, res, signSession(config, user.id));
    res.status(201).json({ user: publicUser(user), workspaceId: workspace.id, projectId: projects[0].id });
  }));

  app.post("/api/auth/logout", (_req, res) => {
    clearSessionCookie(config, res);
    res.status(204).end();
  });

  app.get("/api/auth/me", auth, asyncRoute(async (req, res) => {
    const user = await store.users.get(req.userId!);
    if (!user) throw new HttpError(401, "UNAUTHENTICATED", "Please sign in.");
    res.json({ user: publicUser(user) });
  }));

  app.get("/api/auth/socket-token", auth, (req, res) => {
    res.json({ token: signSocketToken(config, req.userId!) });
  });

  // ---------- Workspaces ----------
  app.get("/api/workspaces", auth, asyncRoute(async (req, res) => {
    const list = await store.workspaces.find({ memberIds: req.userId! }, { sort: "createdAt" });
    const projects = list.length ? await store.projects.find({ workspaceId: { $in: list.map((w) => w.id) } }) : [];
    res.json({
      workspaces: list.map((w) => ({
        id: w.id, name: w.name, role: roleOf(w, req.userId!), memberCount: w.members.length,
        projectCount: projects.filter((p) => p.workspaceId === w.id).length,
      })),
    });
  }));

  app.post("/api/workspaces", auth, asyncRoute(async (req, res) => {
    const { name } = workspaceBody.parse(req.body);
    const ws = await store.workspaces.insert(newWorkspace(name, req.userId!));
    res.status(201).json({ workspace: await workspaceDetails(ws, req.userId!) });
  }));

  app.get("/api/workspaces/:wid", auth, asyncRoute(async (req, res) => {
    const { ws } = await loadWorkspace(req, String(req.params.wid));
    res.json({ workspace: await workspaceDetails(ws, req.userId!) });
  }));

  app.patch("/api/workspaces/:wid", auth, asyncRoute(async (req, res) => {
    const { ws, role } = await loadWorkspace(req, String(req.params.wid));
    need(role, "admin", "Only admins can rename the workspace.");
    const { name } = workspaceBody.parse(req.body);
    const updated = (await store.workspaces.update(ws.id, { name, updatedAt: new Date() }))!;
    realtime.toWorkspace(ws.id, "workspace:changed", { workspaceId: ws.id });
    res.json({ workspace: await workspaceDetails(updated, req.userId!) });
  }));

  /** New invite link; anyone holding the old one can no longer join. */
  app.post("/api/workspaces/:wid/invite/rotate", auth, asyncRoute(async (req, res) => {
    const { ws, role } = await loadWorkspace(req, String(req.params.wid));
    need(role, "admin", "Only admins can reset the invite link.");
    const updated = (await store.workspaces.update(ws.id, { inviteCode: inviteCode(), updatedAt: new Date() }))!;
    res.json({ workspace: await workspaceDetails(updated, req.userId!) });
  }));

  app.get("/api/invites/:code", auth, asyncRoute(async (req, res) => {
    const [ws] = await store.workspaces.find({ inviteCode: String(req.params.code) }, { limit: 1 });
    if (!ws) throw new HttpError(404, "INVALID_INVITE", "This invite link is invalid or has been reset.");
    res.json({ workspace: { id: ws.id, name: ws.name, memberCount: ws.members.length }, alreadyMember: ws.memberIds.includes(req.userId!) });
  }));

  app.post("/api/workspaces/join", auth, asyncRoute(async (req, res) => {
    const { code } = joinBody.parse(req.body);
    const [ws] = await store.workspaces.find({ inviteCode: code }, { limit: 1 });
    if (!ws) throw new HttpError(404, "INVALID_INVITE", "This invite link is invalid or has been reset.");
    if (ws.memberIds.includes(req.userId!)) return res.json({ workspace: await workspaceDetails(ws, req.userId!) });
    const updated = (await store.workspaces.update(ws.id, {
      members: [...ws.members, { userId: req.userId!, role: "member" }], memberIds: [...ws.memberIds, req.userId!], updatedAt: new Date(),
    }))!;
    await record({ ws: updated, actor: req.userId!, type: "member.joined" });
    realtime.toWorkspace(ws.id, "workspace:changed", { workspaceId: ws.id });
    res.json({ workspace: await workspaceDetails(updated, req.userId!) });
  }));

  /** Admins manage people ranked below them; nobody can change the owner. */
  const assertCanManage = (ws: Workspace, actorRole: Role, targetId: string) => {
    const target = ws.members.find((m) => m.userId === targetId);
    if (!target) throw notFound("Member");
    need(actorRole, "admin", "Only admins can manage members.");
    if (target.role === "owner") throw forbid("The owner's role can't be changed.");
    if (actorRole === "admin" && target.role === "admin") throw forbid("Admins can't change other admins.");
    return target;
  };

  app.patch("/api/workspaces/:wid/members/:uid", auth, asyncRoute(async (req, res) => {
    const { ws, role } = await loadWorkspace(req, String(req.params.wid));
    const { role: next } = memberRole.parse(req.body);
    assertCanManage(ws, role, String(req.params.uid));
    if (role === "admin" && next === "admin") throw forbid("Only the owner can make admins.");
    const members = ws.members.map((m) => (m.userId === req.params.uid ? { ...m, role: next } : m));
    const updated = (await store.workspaces.update(ws.id, { members, updatedAt: new Date() }))!;
    realtime.toWorkspace(ws.id, "workspace:changed", { workspaceId: ws.id });
    res.json({ workspace: await workspaceDetails(updated, req.userId!) });
  }));

  app.delete("/api/workspaces/:wid/members/:uid", auth, asyncRoute(async (req, res) => {
    const { ws, role } = await loadWorkspace(req, String(req.params.wid));
    const target = String(req.params.uid);
    if (target === req.userId) {
      if (role === "owner") throw forbid("The owner can't leave their own workspace.");
    } else {
      assertCanManage(ws, role, target);
    }
    await store.workspaces.update(ws.id, {
      members: ws.members.filter((m) => m.userId !== target), memberIds: ws.memberIds.filter((id) => id !== target), updatedAt: new Date(),
    });
    // Their tasks stay but become unassigned, so nothing points at someone who can't see it.
    for (const t of await store.tasks.find({ workspaceId: ws.id, assigneeId: target })) {
      pushTask((await store.tasks.update(t.id, { assigneeId: null, version: t.version + 1, updatedAt: new Date() }))!);
    }
    realtime.evict(ws.id, target);
    realtime.toWorkspace(ws.id, "workspace:changed", { workspaceId: ws.id });
    res.status(204).end();
  }));

  // ---------- Projects ----------
  const withCounts = (projects: Project[], tasks: Task[], today: string) =>
    projects.map((p) => ({ ...p, stats: projectStats(tasks.filter((t) => t.projectId === p.id), today) }));

  app.get("/api/workspaces/:wid/projects", auth, asyncRoute(async (req, res) => {
    const { ws } = await loadWorkspace(req, String(req.params.wid));
    const { today = serverToday() } = todayQuery.parse(req.query);
    const [projects, tasks] = await Promise.all([store.projects.find({ workspaceId: ws.id }, { sort: "createdAt" }), store.tasks.find({ workspaceId: ws.id })]);
    res.json({ projects: withCounts(projects, tasks, today) });
  }));

  app.post("/api/workspaces/:wid/projects", auth, asyncRoute(async (req, res) => {
    const { ws, role } = await loadWorkspace(req, String(req.params.wid));
    canEdit(role);
    const body = projectBody.parse(req.body);
    const count = await store.projects.count({ workspaceId: ws.id });
    const project = await store.projects.insert(
      newProject(ws.id, body.name, req.userId!, body.color ?? PROJECT_COLORS[count % PROJECT_COLORS.length], body.description ?? ""),
    );
    await record({ ws, actor: req.userId!, type: "project.created", projectId: project.id, data: { name: project.name } });
    const [withStats] = withCounts([project], [], serverToday());
    realtime.toWorkspace(ws.id, "project:upsert", { project: withStats });
    res.status(201).json({ project: withStats });
  }));

  app.get("/api/projects/:pid", auth, asyncRoute(async (req, res) => {
    const { project } = await loadProject(req);
    res.json({ project });
  }));

  app.patch("/api/projects/:pid", auth, asyncRoute(async (req, res) => {
    const { project, ws, role } = await loadProject(req);
    canEdit(role);
    const body = projectBody.partial().parse(req.body);
    const updated = (await store.projects.update(project.id, { ...body, updatedAt: new Date() }))!;
    const [withStats] = withCounts([updated], await store.tasks.find({ projectId: project.id }), serverToday());
    realtime.toWorkspace(ws.id, "project:upsert", { project: withStats });
    res.json({ project: withStats });
  }));

  app.delete("/api/projects/:pid", auth, asyncRoute(async (req, res) => {
    const { project, ws, role } = await loadProject(req);
    need(role, "admin", "Only admins can delete projects.");
    await Promise.all([
      store.tasks.removeWhere({ projectId: project.id }),
      store.comments.removeWhere({ projectId: project.id }),
      store.activity.removeWhere({ projectId: project.id }),
    ]);
    await store.projects.remove(project.id);
    realtime.toWorkspace(ws.id, "project:delete", { projectId: project.id, workspaceId: ws.id });
    res.status(204).end();
  }));

  // ---------- Tasks ----------
  app.get("/api/projects/:pid/tasks", auth, asyncRoute(async (req, res) => {
    const { project } = await loadProject(req);
    res.json({ tasks: await store.tasks.find({ projectId: project.id }, { sort: "order" }) });
  }));

  app.post("/api/projects/:pid/tasks", auth, asyncRoute(async (req, res) => {
    const { project, ws, role } = await loadProject(req);
    canEdit(role);
    const body = taskCreate.parse(req.body);
    assertAssignee(ws, body.assigneeId);
    const task = await store.tasks.insert(newTask({ project, createdBy: req.userId!, ...body, order: await bottomOf(project.id, body.status) }));
    pushTask(task);
    await record({ ws, actor: req.userId!, type: "task.created", projectId: project.id, taskId: task.id, data: { title: task.title } });
    res.status(201).json({ task });
  }));

  /** Adds the tasks a user picked from an AI breakdown, in order, at the bottom of To do. */
  app.post("/api/projects/:pid/tasks/bulk", auth, asyncRoute(async (req, res) => {
    const { project, ws, role } = await loadProject(req);
    canEdit(role);
    const { tasks: rows, goal } = bulkCreate.parse(req.body);
    let order = await bottomOf(project.id, "todo");
    const created: Task[] = [];
    for (const row of rows) {
      created.push(await store.tasks.insert(newTask({ project, createdBy: req.userId!, status: "todo", order, ...row })));
      order = orderBetween(order, null);
    }
    created.forEach(pushTask);
    await record({ ws, actor: req.userId!, type: "ai.tasks_created", projectId: project.id, data: { count: created.length, goal: goal ?? null } });
    res.status(201).json({ tasks: created });
  }));

  app.get("/api/tasks/:tid", auth, asyncRoute(async (req, res) => {
    const { task } = await loadTask(req);
    res.json({ task });
  }));

  app.patch("/api/tasks/:tid", auth, asyncRoute(async (req, res) => {
    const { task, ws, role } = await loadTask(req);
    canEdit(role);
    const { version, ...changes } = taskPatch.parse(req.body);
    assertAssignee(ws, changes.assigneeId);
    const now = new Date();
    const patch: Partial<Task> = { ...changes, version: task.version + 1, updatedAt: now };
    if (changes.status && changes.status !== task.status) {
      patch.order = await bottomOf(task.projectId, changes.status);
      patch.completedAt = changes.status === "done" ? now : null;
    }
    // Optimistic concurrency: the write only lands if nobody saved a newer version in between.
    const updated = version === task.version ? await store.tasks.updateIfVersion(task.id, version, patch) : null;
    if (!updated) {
      const current = await store.tasks.get(task.id);
      throw new HttpError(409, "STALE", "Someone else changed this task. Your view has been refreshed.", { task: current });
    }
    pushTask(updated);
    const changed = Object.keys(changes).filter((k) => JSON.stringify(changes[k as keyof typeof changes]) !== JSON.stringify(task[k as keyof Task]));
    if (changed.includes("assigneeId")) {
      const n = await names(updated.assigneeId ? [updated.assigneeId] : []);
      await record({ ws, actor: req.userId!, type: "task.assigned", projectId: task.projectId, taskId: task.id, data: { title: updated.title, assignee: updated.assigneeId ? n.get(updated.assigneeId) : null } });
    }
    if (changed.includes("status")) {
      await record({ ws, actor: req.userId!, type: "task.moved", projectId: task.projectId, taskId: task.id, data: { title: updated.title, from: task.status, to: updated.status } });
    }
    const other = changed.filter((k) => k !== "assigneeId" && k !== "status");
    if (other.length) {
      await record({ ws, actor: req.userId!, type: "task.updated", projectId: task.projectId, taskId: task.id, data: { title: updated.title, fields: other } });
    }
    res.json({ task: updated });
  }));

  /** Drag-and-drop: places the card between two neighbours (fractional order, one row written). */
  app.post("/api/tasks/:tid/move", auth, asyncRoute(async (req, res) => {
    const { task, ws, role } = await loadTask(req);
    canEdit(role);
    const { status, prevId, nextId } = taskMove.parse(req.body);
    const neighbour = async (id: string | null) => {
      if (!id || id === task.id) return null;
      const n = await store.tasks.get(id);
      // Neighbours from a stale client (other column/project) are ignored rather than trusted.
      return n && n.projectId === task.projectId && n.status === status ? n : null;
    };
    const [prev, next] = await Promise.all([neighbour(prevId), neighbour(nextId)]);
    let order: number;
    if (!prev && !next) order = await bottomOf(task.projectId, status);
    else if (needsRespace(prev?.order ?? null, next?.order ?? null)) {
      // Rare: neighbours are too close for a midpoint, so re-space the column once and retry.
      const column = (await store.tasks.find({ projectId: task.projectId, status }, { sort: "order" })).filter((t) => t.id !== task.id);
      const orders = respaced(column.length);
      for (const [i, t] of column.entries()) pushTask((await store.tasks.update(t.id, { order: orders[i], version: t.version + 1 }))!);
      const p = prev ? column.findIndex((t) => t.id === prev.id) : -1;
      order = orderBetween(p >= 0 ? orders[p] : null, p + 1 < orders.length ? orders[p + 1] : null);
    } else order = orderBetween(prev?.order ?? null, next?.order ?? null);

    const now = new Date();
    const moved = (await store.tasks.update(task.id, {
      status, order, version: task.version + 1, updatedAt: now,
      completedAt: status === "done" ? (task.status === "done" ? task.completedAt : now) : null,
    }))!;
    pushTask(moved);
    if (status !== task.status) {
      await record({ ws, actor: req.userId!, type: "task.moved", projectId: task.projectId, taskId: task.id, data: { title: task.title, from: task.status, to: status } });
    }
    res.json({ task: moved });
  }));

  app.delete("/api/tasks/:tid", auth, asyncRoute(async (req, res) => {
    const { task, ws, role } = await loadTask(req);
    canEdit(role);
    await store.tasks.remove(task.id);
    await store.comments.removeWhere({ taskId: task.id });
    realtime.toWorkspace(ws.id, "task:delete", { taskId: task.id, projectId: task.projectId });
    await record({ ws, actor: req.userId!, type: "task.deleted", projectId: task.projectId, data: { title: task.title } });
    res.status(204).end();
  }));

  // ---------- Comments ----------
  const withAuthor = async (comments: Comment[]) => {
    const n = await names(comments.map((c) => c.authorId));
    return comments.map((c) => ({ ...c, authorName: n.get(c.authorId) ?? "Former member" }));
  };

  app.get("/api/tasks/:tid/comments", auth, asyncRoute(async (req, res) => {
    const { task } = await loadTask(req);
    res.json({ comments: await withAuthor(await store.comments.find({ taskId: task.id }, { sort: "createdAt" })) });
  }));

  app.post("/api/tasks/:tid/comments", auth, asyncRoute(async (req, res) => {
    const { task, ws, role } = await loadTask(req);
    canEdit(role);
    const { body } = commentBody.parse(req.body);
    const comment = await store.comments.insert({
      id: newId(), workspaceId: ws.id, projectId: task.projectId, taskId: task.id, authorId: req.userId!, body, createdAt: new Date(),
    });
    const [withName] = await withAuthor([comment]);
    realtime.toWorkspace(ws.id, "comment:new", { comment: withName });
    await record({ ws, actor: req.userId!, type: "comment.added", projectId: task.projectId, taskId: task.id, data: { title: task.title } });
    res.status(201).json({ comment: withName });
  }));

  app.delete("/api/comments/:cid", auth, asyncRoute(async (req, res) => {
    const comment = await store.comments.get(String(req.params.cid));
    if (!comment) throw notFound("Comment");
    const { role } = await loadWorkspace(req, comment.workspaceId).catch(() => {
      throw notFound("Comment");
    });
    if (comment.authorId !== req.userId && !atLeast(role, "admin")) throw forbid("You can only delete your own comments.");
    await store.comments.remove(comment.id);
    realtime.toWorkspace(comment.workspaceId, "comment:delete", { commentId: comment.id, taskId: comment.taskId });
    res.status(204).end();
  }));

  // ---------- Activity ----------
  app.get("/api/workspaces/:wid/activity", auth, asyncRoute(async (req, res) => {
    const { ws } = await loadWorkspace(req, String(req.params.wid));
    const q = z.object({ projectId: z.string().max(32).optional(), taskId: z.string().max(32).optional(), limit: z.coerce.number().int().min(1).max(100).default(40) }).parse(req.query);
    const items = await store.activity.find({ workspaceId: ws.id, projectId: q.projectId, taskId: q.taskId }, { sort: "createdAt", desc: true, limit: q.limit });
    const n = await names(items.map((a) => a.actorId));
    res.json({ activity: items.map((a: Activity) => ({ ...a, actorName: n.get(a.actorId) ?? "Former member" })) });
  }));

  // ---------- AI ----------
  app.get("/api/ai/status", auth, (_req, res) => {
    res.json(ai.status());
  });

  app.post("/api/projects/:pid/ai/breakdown", auth, aiLimiter, asyncRoute(async (req, res) => {
    const { project, role } = await loadProject(req);
    canEdit(role);
    const { goal } = goalBody.parse(req.body);
    const existing = await store.tasks.find({ projectId: project.id });
    const result = await ai.breakdown(req.userId!, project, goal, existing.map((t) => t.title));
    res.json({ tasks: result.value, source: result.source, note: result.note ?? null });
  }));

  app.get("/api/projects/:pid/ai/summary", auth, aiLimiter, asyncRoute(async (req, res) => {
    const { project, ws } = await loadProject(req);
    const { today = serverToday() } = todayQuery.parse(req.query);
    const tasks = await store.tasks.find({ projectId: project.id });
    res.json({ summary: await ai.summary(req.userId!, project, tasks, await names(ws.memberIds), today) });
  }));

  app.get("/api/workspaces/:wid/ai/standup", auth, aiLimiter, asyncRoute(async (req, res) => {
    const { ws } = await loadWorkspace(req, String(req.params.wid));
    const { today = serverToday() } = todayQuery.parse(req.query);
    const user = (await store.users.get(req.userId!))!;
    const [tasks, projects, activity] = await Promise.all([
      store.tasks.find({ workspaceId: ws.id }),
      store.projects.find({ workspaceId: ws.id }),
      store.activity.find({ workspaceId: ws.id }, { sort: "createdAt", desc: true, limit: 200 }),
    ]);
    res.json({ standup: await ai.standup(user, tasks, projects, activity, today) });
  }));

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "NOT_FOUND", message: "No such endpoint." });
  });

  // One error shape for every failure; no stack traces leave the server.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "VALIDATION", message: err.issues[0]?.message ?? "Invalid request." });
      return;
    }
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.code, message: err.message, ...err.extra });
      return;
    }
    if ((err as { code?: number })?.code === 11000) {
      res.status(409).json({ error: "CONFLICT", message: "That already exists." });
      return;
    }
    if ((err as { type?: string })?.type === "entity.parse.failed") {
      res.status(400).json({ error: "VALIDATION", message: "Malformed JSON." });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "INTERNAL", message: "Something went wrong." });
  });

  return app;
}
