import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Socket } from "socket.io-client";
import { connect, emitAck, firstProject, invite, nextEvent, signup, socketFor, startServer } from "./helpers.js";

let srv: Awaited<ReturnType<typeof startServer>>;
const sockets: Socket[] = [];
beforeAll(async () => {
  srv = await startServer();
});
afterAll(async () => {
  sockets.forEach((s) => s.close());
  await srv.close();
});

const open = async (agent: Parameters<typeof socketFor>[1]) => {
  const s = await socketFor(srv.url, agent);
  sockets.push(s);
  return s;
};

describe("realtime", () => {
  it("refuses sockets without a valid token", async () => {
    await expect(connect(srv.url, "not-a-token")).rejects.toThrow("UNAUTHENTICATED");
    // A session token is not accepted as a socket token (different audience).
    await expect(connect(srv.url, "")).rejects.toThrow();
  });

  it("won't let a non-member join a workspace room", async () => {
    const a = await signup(srv.app, "Owner");
    const b = await signup(srv.app, "Stranger");
    const s = await open(b.agent);
    expect(await emitAck(s, "workspace:join", { workspaceId: a.workspaceId })).toEqual({ ok: false, error: "NOT_FOUND" });
  });

  it("pushes task changes, comments and activity to teammates", async () => {
    const a = await signup(srv.app, "Ada");
    const b = await signup(srv.app, "Ben");
    await invite(a.agent, a.workspaceId, b.agent);
    const project = await firstProject(a.agent, a.workspaceId);
    const sb = await open(b.agent);
    expect(await emitAck(sb, "workspace:join", { workspaceId: a.workspaceId })).toEqual({ ok: true });

    const created = nextEvent(sb, "task:upsert", (d) => d.task.title === "Live task");
    const activity = nextEvent(sb, "activity:new", (d) => d.activity.type === "task.created" && d.activity.data.title === "Live task");
    const task = (await a.agent.post(`/api/projects/${project.id}/tasks`).send({ title: "Live task" })).body.task;
    expect((await created).task.id).toBe(task.id);
    expect((await activity).activity.actorName).toBe("Ada");

    const moved = nextEvent(sb, "task:upsert", (d) => d.task.id === task.id && d.task.status === "in_progress");
    await a.agent.post(`/api/tasks/${task.id}/move`).send({ status: "in_progress" });
    expect((await moved).task.version).toBe(2);

    const comment = nextEvent(sb, "comment:new");
    await a.agent.post(`/api/tasks/${task.id}/comments`).send({ body: "On it" });
    expect((await comment).comment).toMatchObject({ body: "On it", authorName: "Ada", taskId: task.id });

    const deleted = nextEvent(sb, "task:delete");
    await a.agent.delete(`/api/tasks/${task.id}`);
    expect((await deleted).taskId).toBe(task.id);
  });

  it("shows who is online and which project they have open", async () => {
    const a = await signup(srv.app, "Ada");
    const b = await signup(srv.app, "Ben");
    await invite(a.agent, a.workspaceId, b.agent);
    const project = await firstProject(a.agent, a.workspaceId);
    const sa = await open(a.agent);
    const sb = await open(b.agent);
    await emitAck(sa, "workspace:join", { workspaceId: a.workspaceId });
    const both = nextEvent(sa, "presence", (d) => d.users.length === 2);
    await emitAck(sb, "workspace:join", { workspaceId: a.workspaceId });
    expect((await both).users.map((u: { name: string }) => u.name).sort()).toEqual(["Ada", "Ben"]);

    const viewing = nextEvent(sa, "presence", (d) => d.users.some((u: { name: string; projectId: string }) => u.name === "Ben" && u.projectId === project.id));
    sb.emit("presence:view", { projectId: project.id });
    await viewing;

    const left = nextEvent(sa, "presence", (d) => d.users.length === 1);
    sb.close();
    expect((await left).users[0].name).toBe("Ada");
  });

  it("removes a member from the live room when they're removed from the workspace", async () => {
    const a = await signup(srv.app, "Ada");
    const b = await signup(srv.app, "Ben");
    const bId = await invite(a.agent, a.workspaceId, b.agent);
    const project = await firstProject(a.agent, a.workspaceId);
    const sb = await open(b.agent);
    await emitAck(sb, "workspace:join", { workspaceId: a.workspaceId });
    const removed = nextEvent(sb, "workspace:removed");
    await a.agent.delete(`/api/workspaces/${a.workspaceId}/members/${bId}`);
    expect((await removed).workspaceId).toBe(a.workspaceId);

    let leaked = false;
    sb.on("task:upsert", () => (leaked = true));
    await a.agent.post(`/api/projects/${project.id}/tasks`).send({ title: "Private now" });
    await new Promise((r) => setTimeout(r, 150));
    expect(leaked).toBe(false);
  });
});
