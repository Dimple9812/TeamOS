/**
 * How long until a change reaches teammates: one person moves cards over HTTP while nine others
 * are connected over Socket.IO. Measures from sending the request to every teammate receiving
 * the update (API + validation + store + fan-out). Local, so internet latency is not included.
 */
import { MemoryStore } from "../src/store/memory.js";
import { demo, emitAck, invite, signup, socketFor, startServer } from "../test/helpers.js";

const MOVES = Number(process.env.MOVES ?? 300);
const WATCHERS = Number(process.env.WATCHERS ?? 9);

const srv = await startServer({ store: new MemoryStore() });
const owner = await demo(srv.app);
const watchers = [];
for (let i = 0; i < WATCHERS; i++) {
  const w = await signup(srv.app, `Watcher${i}`);
  await invite(owner.agent, owner.workspaceId, w.agent);
  const s = await socketFor(srv.url, w.agent);
  await emitAck(s, "workspace:join", { workspaceId: owner.workspaceId });
  watchers.push(s);
}
const tasks = (await owner.agent.get(`/api/projects/${owner.projectId}/tasks`)).body.tasks as { id: string }[];
const statuses = ["todo", "in_progress", "review", "done"];

const samples: number[] = [];
for (let i = 0; i < MOVES; i++) {
  const task = tasks[i % tasks.length];
  const status = statuses[i % statuses.length];
  const arrived = watchers.map(
    (s) =>
      new Promise<void>((resolve) => {
        const h = (d: { task: { id: string; status: string } }) => {
          if (d.task.id === task.id && d.task.status === status) {
            s.off("task:upsert", h);
            resolve();
          }
        };
        s.on("task:upsert", h);
      }),
  );
  const t0 = performance.now();
  await owner.agent.post(`/api/tasks/${task.id}/move`).send({ status });
  await Promise.all(arrived);
  samples.push(performance.now() - t0);
}

samples.sort((a, b) => a - b);
const pct = (p: number) => samples[Math.min(samples.length - 1, Math.floor((p / 100) * samples.length))].toFixed(1);
console.log(`${MOVES} card moves, ${WATCHERS} teammates watching (move request → all teammates updated):`);
console.log(`p50 ${pct(50)} ms · p95 ${pct(95)} ms · p99 ${pct(99)} ms · max ${samples.at(-1)!.toFixed(1)} ms`);
watchers.forEach((s) => s.close());
await srv.close();
process.exit(0);
