import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import type { Config } from "./config.js";
import { verifyToken } from "./auth.js";
import type { Store } from "./store/types.js";
import { roleOf } from "./store/types.js";

export interface PresenceEntry {
  userId: string;
  name: string;
  /** Project the person has open, or null when they're on the workspace overview. */
  projectId: string | null;
}

/** What the HTTP routes use to push changes to everyone in a workspace. */
export interface Broadcaster {
  toWorkspace(workspaceId: string, event: string, payload: unknown): void;
  /** Removes a user's sockets from a workspace room (after they're removed from the workspace). */
  evict(workspaceId: string, userId: string): void;
}

interface SocketData {
  userId: string;
  name: string;
  workspaceId: string | null;
  projectId: string | null;
}

const room = (workspaceId: string) => `ws:${workspaceId}`;

export function attachRealtime(http: HttpServer, { config, store }: { config: Config; store: Store }) {
  const io = new Server(http, {
    cors: { origin: config.clientOrigins, credentials: true },
    // Small payloads only; nothing large ever travels over the socket.
    maxHttpBufferSize: 16 * 1024,
  });

  // Sockets authenticate with a short-lived token from /api/auth/socket-token (the API is on another host).
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    const userId = typeof token === "string" ? verifyToken(config, token, "socket") : null;
    const user = userId ? await store.users.get(userId) : null;
    if (!user) return next(new Error("UNAUTHENTICATED"));
    Object.assign(socket.data, { userId: user.id, name: user.name, workspaceId: null, projectId: null } satisfies SocketData);
    next();
  });

  const presenceOf = async (workspaceId: string): Promise<PresenceEntry[]> => {
    const sockets = await io.in(room(workspaceId)).fetchSockets();
    const seen = new Map<string, PresenceEntry>();
    for (const s of sockets) {
      const d = s.data as SocketData;
      // One entry per person; a project view wins over the overview if they have several tabs open.
      if (!seen.has(d.userId) || d.projectId) seen.set(d.userId, { userId: d.userId, name: d.name, projectId: d.projectId });
    }
    return [...seen.values()];
  };
  const broadcastPresence = async (workspaceId: string) => {
    io.to(room(workspaceId)).emit("presence", { workspaceId, users: await presenceOf(workspaceId) });
  };

  const leaveCurrent = async (socket: Socket) => {
    const d = socket.data as SocketData;
    if (!d.workspaceId) return;
    const previous = d.workspaceId;
    await socket.leave(room(previous));
    d.workspaceId = null;
    d.projectId = null;
    await broadcastPresence(previous);
  };

  io.on("connection", (socket) => {
    const data = socket.data as SocketData;

    socket.on("workspace:join", async (msg: { workspaceId?: unknown }, ack?: (r: { ok: boolean; error?: string }) => void) => {
      const workspaceId = typeof msg?.workspaceId === "string" ? msg.workspaceId : "";
      const ws = workspaceId ? await store.workspaces.get(workspaceId) : null;
      if (!ws || !roleOf(ws, data.userId)) return ack?.({ ok: false, error: "NOT_FOUND" });
      if (data.workspaceId !== workspaceId) await leaveCurrent(socket);
      await socket.join(room(workspaceId));
      data.workspaceId = workspaceId;
      ack?.({ ok: true });
      await broadcastPresence(workspaceId);
    });

    socket.on("presence:view", async (msg: { projectId?: unknown }) => {
      if (!data.workspaceId) return;
      data.projectId = typeof msg?.projectId === "string" ? msg.projectId.slice(0, 32) : null;
      await broadcastPresence(data.workspaceId);
    });

    socket.on("workspace:leave", () => void leaveCurrent(socket));

    socket.on("disconnect", () => {
      if (data.workspaceId) void broadcastPresence(data.workspaceId);
    });
  });

  const broadcaster: Broadcaster = {
    toWorkspace(workspaceId, event, payload) {
      io.to(room(workspaceId)).emit(event, payload);
    },
    evict(workspaceId, userId) {
      void (async () => {
        for (const s of await io.in(room(workspaceId)).fetchSockets()) {
          if ((s.data as SocketData).userId === userId) {
            s.emit("workspace:removed", { workspaceId });
            s.leave(room(workspaceId));
            (s.data as SocketData).workspaceId = null;
          }
        }
        await broadcastPresence(workspaceId);
      })();
    },
  };

  return { io, broadcaster };
}
