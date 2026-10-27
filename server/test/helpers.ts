import type { AddressInfo } from "node:net";
import request from "supertest";
import { io as ioClient, type Socket } from "socket.io-client";
import { loadConfig } from "../src/config.js";
import { MemoryStore } from "../src/store/memory.js";
import { buildServer } from "../src/server.js";
import type { FetchLike } from "../src/ai/llm.js";
import type { Store } from "../src/store/types.js";

export function testConfig(overrides: Record<string, string> = {}) {
  return loadConfig({ NODE_ENV: "test", STORE: "memory", JWT_SECRET: "test-secret", ...overrides });
}

export async function startServer(opts: { store?: Store; env?: Record<string, string>; fetch?: FetchLike } = {}) {
  const store = opts.store ?? new MemoryStore();
  const server = buildServer(testConfig(opts.env), store, { fetch: opts.fetch });
  await new Promise<void>((r) => server.http.listen(0, r));
  const port = (server.http.address() as AddressInfo).port;
  return { ...server, store, url: `http://127.0.0.1:${port}` };
}

export type Agent = ReturnType<typeof request.agent>;

/** Signs up through the API; returns a cookie-carrying agent, the user and their starter workspace. */
export async function signup(app: Parameters<typeof request.agent>[0], name = "Ada") {
  const agent = request.agent(app);
  const email = `${name.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const res = await agent.post("/api/auth/signup").send({ email, password: "correct horse", name });
  if (res.status !== 201) throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, user: res.body.user as { id: string; name: string }, workspaceId: res.body.workspaceId as string, email };
}

/** One-click demo login: a guest who owns a populated workspace. */
export async function demo(app: Parameters<typeof request.agent>[0]) {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/demo");
  if (res.status !== 201) throw new Error(`demo failed: ${res.status}`);
  return { agent, user: res.body.user as { id: string; name: string }, workspaceId: res.body.workspaceId as string, projectId: res.body.projectId as string };
}

/** Adds `who` to the workspace through its invite link, optionally setting a role as the owner. */
export async function invite(owner: Agent, workspaceId: string, who: Agent, role?: "admin" | "member" | "viewer") {
  const ws = (await owner.get(`/api/workspaces/${workspaceId}`)).body.workspace;
  const joined = await who.post("/api/workspaces/join").send({ code: ws.inviteCode });
  if (joined.status !== 200) throw new Error(`join failed: ${joined.status}`);
  const me = (await who.get("/api/auth/me")).body.user;
  if (role && role !== "member") await owner.patch(`/api/workspaces/${workspaceId}/members/${me.id}`).send({ role });
  return me.id as string;
}

export async function firstProject(agent: Agent, workspaceId: string) {
  return (await agent.get(`/api/workspaces/${workspaceId}/projects`)).body.projects[0] as { id: string; name: string };
}

export function connect(url: string, token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = ioClient(url, { auth: { token }, transports: ["websocket"], forceNew: true, reconnection: false });
    s.once("connect", () => resolve(s));
    s.once("connect_error", reject);
  });
}

export const socketFor = async (url: string, agent: Agent) => connect(url, (await agent.get("/api/auth/socket-token")).body.token);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const emitAck = <T = any>(s: Socket, event: string, payload: unknown): Promise<T> => new Promise((resolve) => s.emit(event, payload, resolve));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const nextEvent = <T = any>(s: Socket, event: string, match: (d: T) => boolean = () => true, timeoutMs = 2000): Promise<T> =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      s.off(event, handler);
      reject(new Error(`timed out waiting for ${event}`));
    }, timeoutMs);
    const handler = (data: T) => {
      if (!match(data)) return;
      clearTimeout(t);
      s.off(event, handler);
      resolve(data);
    };
    s.on(event, handler);
  });

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
