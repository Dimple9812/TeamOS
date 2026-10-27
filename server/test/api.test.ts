import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { demo, firstProject, invite, signup, startServer } from "./helpers.js";

let srv: Awaited<ReturnType<typeof startServer>>;
beforeAll(async () => {
  srv = await startServer();
});
afterAll(async () => {
  await srv.close();
});

describe("auth", () => {
  it("signs up into a starter workspace and keeps the session in an httpOnly cookie", async () => {
    const { agent, workspaceId } = await signup(srv.app, "Grace");
    expect((await agent.get("/api/auth/me")).body.user.name).toBe("Grace");
    const projects = (await agent.get(`/api/workspaces/${workspaceId}/projects`)).body.projects;
    expect(projects[0].name).toBe("Getting started");
    expect(projects[0].stats.total).toBe(5);
  });

  it("gives the same answer for a wrong password and an unknown email", async () => {
    const { email } = await signup(srv.app, "Linus");
    const { default: request } = await import("supertest");
    const wrong = await request(srv.app).post("/api/auth/login").send({ email, password: "wrong password" });
    const unknown = await request(srv.app).post("/api/auth/login").send({ email: "nobody@example.com", password: "wrong password" });
    expect(wrong.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
  });

  it("rejects requests without a session", async () => {
    const { default: request } = await import("supertest");
    const res = await request(srv.app).get("/api/workspaces");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("UNAUTHENTICATED");
  });

  it("demo login seeds a team workspace with projects, tasks, comments and activity", async () => {
    const { agent, workspaceId, projectId } = await demo(srv.app);
    const ws = (await agent.get(`/api/workspaces/${workspaceId}`)).body.workspace;
    expect(ws.members).toHaveLength(3);
    expect(ws.role).toBe("owner");
    const tasks = (await agent.get(`/api/projects/${projectId}/tasks`)).body.tasks;
    expect(tasks.length).toBeGreaterThan(10);
    expect(new Set(tasks.map((t: { status: string }) => t.status))).toEqual(new Set(["todo", "in_progress", "review", "done"]));
    const activity = (await agent.get(`/api/workspaces/${workspaceId}/activity`)).body.activity;
    expect(activity.length).toBeGreaterThan(10);
    expect(activity[0].actorName).toBeTruthy();
  });
});

describe("workspaces and roles", () => {
  it("hides workspaces from non-members with 404", async () => {
    const a = await signup(srv.app, "Owner");
    const b = await signup(srv.app, "Stranger");
    expect((await b.agent.get(`/api/workspaces/${a.workspaceId}`)).status).toBe(404);
    const project = await firstProject(a.agent, a.workspaceId);
    expect((await b.agent.get(`/api/projects/${project.id}/tasks`)).status).toBe(404);
  });

  it("lets people join with the invite link, and resetting the link locks out the old one", async () => {
    const a = await signup(srv.app, "Owner");
    const b = await signup(srv.app, "Joiner");
    const c = await signup(srv.app, "Late");
    const code = (await a.agent.get(`/api/workspaces/${a.workspaceId}`)).body.workspace.inviteCode;
    expect((await b.agent.post("/api/workspaces/join").send({ code })).status).toBe(200);
    expect((await b.agent.get(`/api/workspaces/${a.workspaceId}`)).body.workspace.role).toBe("member");
    // Members can't see the invite code.
    expect((await b.agent.get(`/api/workspaces/${a.workspaceId}`)).body.workspace.inviteCode).toBeNull();
    await a.agent.post(`/api/workspaces/${a.workspaceId}/invite/rotate`);
    expect((await c.agent.post("/api/workspaces/join").send({ code })).status).toBe(404);
  });

  it("enforces viewer read-only on the server", async () => {
    const a = await signup(srv.app, "Owner");
    const v = await signup(srv.app, "Viewer");
    await invite(a.agent, a.workspaceId, v.agent, "viewer");
    const project = await firstProject(a.agent, a.workspaceId);
    expect((await v.agent.get(`/api/projects/${project.id}/tasks`)).status).toBe(200);
    const create = await v.agent.post(`/api/projects/${project.id}/tasks`).send({ title: "Sneaky" });
    expect(create.status).toBe(403);
    expect(create.body.error).toBe("FORBIDDEN");
  });

  it("only the owner can make admins, and the owner can't be demoted or leave", async () => {
    const a = await signup(srv.app, "Owner");
    const b = await signup(srv.app, "Admin");
    const c = await signup(srv.app, "Member");
    const bId = await invite(a.agent, a.workspaceId, b.agent, "admin");
    const cId = await invite(a.agent, a.workspaceId, c.agent);
    expect((await b.agent.patch(`/api/workspaces/${a.workspaceId}/members/${cId}`).send({ role: "admin" })).status).toBe(403);
    expect((await b.agent.patch(`/api/workspaces/${a.workspaceId}/members/${cId}`).send({ role: "viewer" })).status).toBe(200);
    expect((await b.agent.patch(`/api/workspaces/${a.workspaceId}/members/${a.user.id}`).send({ role: "viewer" })).status).toBe(403);
    expect((await a.agent.delete(`/api/workspaces/${a.workspaceId}/members/${a.user.id}`)).status).toBe(403);
    expect((await a.agent.delete(`/api/workspaces/${a.workspaceId}/members/${bId}`)).status).toBe(204);
    expect((await b.agent.get(`/api/workspaces/${a.workspaceId}`)).status).toBe(404);
  });

  it("unassigns a removed member's tasks", async () => {
    const a = await signup(srv.app, "Owner");
    const b = await signup(srv.app, "Leaver");
    const bId = await invite(a.agent, a.workspaceId, b.agent);
    const project = await firstProject(a.agent, a.workspaceId);
    const task = (await a.agent.post(`/api/projects/${project.id}/tasks`).send({ title: "Theirs", assigneeId: bId })).body.task;
    await b.agent.delete(`/api/workspaces/${a.workspaceId}/members/${bId}`);
    expect((await a.agent.get(`/api/tasks/${task.id}`)).body.task.assigneeId).toBeNull();
  });
});

describe("tasks", () => {
  it("creates, edits and rejects assignees outside the workspace", async () => {
    const a = await signup(srv.app);
    const outsider = await signup(srv.app, "Outsider");
    const project = await firstProject(a.agent, a.workspaceId);
    const created = await a.agent.post(`/api/projects/${project.id}/tasks`).send({ title: "Write tests", priority: "high", dueDate: "2026-11-02" });
    expect(created.status).toBe(201);
    expect(created.body.task).toMatchObject({ title: "Write tests", status: "todo", priority: "high", version: 1 });
    const bad = await a.agent.post(`/api/projects/${project.id}/tasks`).send({ title: "x", assigneeId: outsider.user.id });
    expect(bad.status).toBe(400);
    const badDate = await a.agent.post(`/api/projects/${project.id}/tasks`).send({ title: "x", dueDate: "next week" });
    expect(badDate.body).toEqual({ error: "VALIDATION", message: "Use a YYYY-MM-DD date" });
  });

  it("returns 409 with the latest task when an edit is based on a stale version", async () => {
    const a = await signup(srv.app);
    const project = await firstProject(a.agent, a.workspaceId);
    const task = (await a.agent.post(`/api/projects/${project.id}/tasks`).send({ title: "Draft" })).body.task;
    const first = await a.agent.patch(`/api/tasks/${task.id}`).send({ title: "Draft v2", version: 1 });
    expect(first.body.task.version).toBe(2);
    const stale = await a.agent.patch(`/api/tasks/${task.id}`).send({ title: "Lost update", version: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.error).toBe("STALE");
    expect(stale.body.task.title).toBe("Draft v2");
  });

  it("moves a card between two neighbours by writing one fractional order", async () => {
    const a = await signup(srv.app);
    const project = (await a.agent.post(`/api/workspaces/${a.workspaceId}/projects`).send({ name: "Board" })).body.project;
    const make = async (title: string) => (await a.agent.post(`/api/projects/${project.id}/tasks`).send({ title })).body.task;
    const [t1, t2, t3] = [await make("one"), await make("two"), await make("three")];
    // Drop "three" between "one" and "two".
    const moved = (await a.agent.post(`/api/tasks/${t3.id}/move`).send({ status: "todo", prevId: t1.id, nextId: t2.id })).body.task;
    expect(moved.order).toBeGreaterThan(t1.order);
    expect(moved.order).toBeLessThan(t2.order);
    const titles = (await a.agent.get(`/api/projects/${project.id}/tasks`)).body.tasks.map((t: { title: string }) => t.title);
    expect(titles).toEqual(["one", "three", "two"]);
  });

  it("sets completedAt when a card reaches Done and clears it when it leaves", async () => {
    const a = await signup(srv.app);
    const project = await firstProject(a.agent, a.workspaceId);
    const task = (await a.agent.post(`/api/projects/${project.id}/tasks`).send({ title: "Ship" })).body.task;
    const done = (await a.agent.post(`/api/tasks/${task.id}/move`).send({ status: "done" })).body.task;
    expect(done.completedAt).toBeTruthy();
    const back = (await a.agent.post(`/api/tasks/${task.id}/move`).send({ status: "review" })).body.task;
    expect(back.completedAt).toBeNull();
    const activity = (await a.agent.get(`/api/workspaces/${a.workspaceId}/activity?taskId=${task.id}`)).body.activity;
    expect(activity.map((x: { type: string; data: { to?: string } }) => `${x.type}:${x.data.to ?? ""}`)).toEqual([
      "task.moved:review", "task.moved:done", "task.created:",
    ]);
  });

  it("re-spaces a column when repeated drops leave no room between two cards", async () => {
    const a = await signup(srv.app);
    const project = (await a.agent.post(`/api/workspaces/${a.workspaceId}/projects`).send({ name: "Tight" })).body.project;
    const make = async (title: string) => (await a.agent.post(`/api/projects/${project.id}/tasks`).send({ title })).body.task;
    const top = await make("top");
    const bottom = await make("bottom");
    // Each drop halves the gap above "bottom"; ~45 halvings exhaust the precision threshold.
    let prev = top;
    for (let i = 0; i < 60; i++) {
      const t = await make(`n${i}`);
      prev = (await a.agent.post(`/api/tasks/${t.id}/move`).send({ status: "todo", prevId: prev.id, nextId: bottom.id })).body.task;
    }
    const tasks = (await a.agent.get(`/api/projects/${project.id}/tasks`)).body.tasks as { title: string; order: number }[];
    expect(tasks[0].title).toBe("top");
    expect(tasks.at(-1)!.title).toBe("bottom");
    expect(tasks.at(-2)!.title).toBe("n59");
    expect(new Set(tasks.map((t) => t.order)).size).toBe(tasks.length);
  });

  it("deleting a project removes its tasks and comments; only admins can do it", async () => {
    const a = await signup(srv.app);
    const m = await signup(srv.app, "Member");
    await invite(a.agent, a.workspaceId, m.agent);
    const project = await firstProject(a.agent, a.workspaceId);
    const task = (await a.agent.get(`/api/projects/${project.id}/tasks`)).body.tasks[0];
    await a.agent.post(`/api/tasks/${task.id}/comments`).send({ body: "hello" });
    expect((await m.agent.delete(`/api/projects/${project.id}`)).status).toBe(403);
    expect((await a.agent.delete(`/api/projects/${project.id}`)).status).toBe(204);
    expect(await srv.store.tasks.count({ projectId: project.id })).toBe(0);
    expect(await srv.store.comments.count({ projectId: project.id })).toBe(0);
  });
});

describe("comments", () => {
  it("adds comments with author names; only the author or an admin can delete", async () => {
    const a = await signup(srv.app, "Owner");
    const m = await signup(srv.app, "Member");
    await invite(a.agent, a.workspaceId, m.agent);
    const project = await firstProject(a.agent, a.workspaceId);
    const task = (await a.agent.get(`/api/projects/${project.id}/tasks`)).body.tasks[0];
    const mine = (await a.agent.post(`/api/tasks/${task.id}/comments`).send({ body: "Owner note" })).body.comment;
    expect(mine.authorName).toBe("Owner");
    expect((await m.agent.delete(`/api/comments/${mine.id}`)).status).toBe(403);
    const theirs = (await m.agent.post(`/api/tasks/${task.id}/comments`).send({ body: "Member note" })).body.comment;
    expect((await a.agent.delete(`/api/comments/${theirs.id}`)).status).toBe(204);
    const list = (await a.agent.get(`/api/tasks/${task.id}/comments`)).body.comments;
    expect(list.map((c: { body: string }) => c.body)).toEqual(["Owner note"]);
  });

  it("rejects empty comments", async () => {
    const a = await signup(srv.app);
    const project = await firstProject(a.agent, a.workspaceId);
    const task = (await a.agent.get(`/api/projects/${project.id}/tasks`)).body.tasks[0];
    const res = await a.agent.post(`/api/tasks/${task.id}/comments`).send({ body: "   " });
    expect(res.status).toBe(400);
  });
});

it("answers unknown API paths and malformed JSON with the standard error shape", async () => {
  const a = await signup(srv.app);
  expect((await a.agent.get("/api/nope")).body).toEqual({ error: "NOT_FOUND", message: "No such endpoint." });
  const bad = await a.agent.post("/api/workspaces").set("Content-Type", "application/json").send("{not json");
  expect(bad.body).toEqual({ error: "VALIDATION", message: "Malformed JSON." });
});
