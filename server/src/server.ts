import { createServer } from "node:http";
import type { Config } from "./config.js";
import type { Store } from "./store/types.js";
import { MemoryStore } from "./store/memory.js";
import { MongoStore } from "./store/mongo.js";
import { createApp } from "./app.js";
import { attachRealtime, type Broadcaster } from "./realtime.js";
import { AiService } from "./ai/service.js";
import type { FetchLike } from "./ai/llm.js";

export async function createStore(config: Config): Promise<Store> {
  return config.store === "mongo" ? MongoStore.connect(config.mongoUri) : new MemoryStore();
}

/** Wires HTTP, sockets and the AI service around one store. Used by index.ts and the integration tests. */
export function buildServer(config: Config, store: Store, opts: { fetch?: FetchLike } = {}) {
  const ai = new AiService(config.ai, opts.fetch);
  // The socket server needs the HTTP server, and the routes need the socket server; this breaks the cycle.
  let target: Broadcaster | null = null;
  const realtime: Broadcaster = {
    toWorkspace: (...args) => target?.toWorkspace(...args),
    evict: (...args) => target?.evict(...args),
  };
  const app = createApp({ config, store, ai, realtime });
  const http = createServer(app);
  const rt = attachRealtime(http, { config, store });
  target = rt.broadcaster;

  async function close() {
    await new Promise<void>((resolve) => rt.io.close(() => resolve()));
    await store.close();
  }
  return { app, http, io: rt.io, ai, close };
}
