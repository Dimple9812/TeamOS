import { afterAll, describe, expect, it } from "vitest";
import { MemoryStore } from "../src/store/memory.js";
import { MongoStore } from "../src/store/mongo.js";
import type { Store } from "../src/store/types.js";
import { newProject, newTask, newWorkspace } from "../src/seed.js";
import { needsRespace, orderBetween, respaced } from "../src/ordering.js";

/**
 * The same contract runs against the in-memory store and, when MONGODB_URI_TEST is set
 * (as it is in CI, with a MongoDB service container), against a real MongoDB.
 */
const targets: [string, () => Promise<Store>][] = [["memory", async () => new MemoryStore()]];
if (process.env.MONGODB_URI_TEST) {
  targets.push(["mongo", () => MongoStore.connect(process.env.MONGODB_URI_TEST!, `teamos_test_${Date.now()}_${Math.round(Math.random() * 1e6)}`)]);
}

const opened: Store[] = [];
afterAll(async () => {
  for (const s of opened) {
    if (s instanceof MongoStore) await s.dropDatabase();
    await s.close();
  }
});

describe.each(targets)("%s store", (_name, make) => {
  const get = async () => {
    const s = await make();
    opened.push(s);
    return s;
  };

  it("enforces unique emails", async () => {
    const s = await get();
    const base = { name: "Ada", passwordHash: "x", isDemo: false, createdAt: new Date() };
    await s.users.insert({ id: "u1", email: "ada@example.com", ...base });
    await expect(s.users.insert({ id: "u2", email: "ada@example.com", ...base })).rejects.toMatchObject({ code: 11000 });
  });

  it("finds workspaces by a value inside an array field", async () => {
    const s = await get();
    const ws = newWorkspace("Team", "owner");
    ws.memberIds.push("member");
    await s.workspaces.insert(ws);
    await s.workspaces.insert(newWorkspace("Other", "someone"));
    expect((await s.workspaces.find({ memberIds: "member" })).map((w) => w.name)).toEqual(["Team"]);
    expect(await s.workspaces.count({ memberIds: "nobody" })).toBe(0);
  });

  it("supports $in, sorting and limits", async () => {
    const s = await get();
    const p = newProject("w", "P", "u", "#000");
    for (const [i, title] of ["c", "a", "b"].entries()) await s.tasks.insert(newTask({ project: p, title, createdBy: "u", order: [3, 1, 2][i] }));
    expect((await s.tasks.find({ projectId: p.id }, { sort: "order" })).map((t) => t.title)).toEqual(["a", "b", "c"]);
    expect((await s.tasks.find({ projectId: p.id }, { sort: "order", desc: true, limit: 1 }))[0].title).toBe("c");
    expect(await s.tasks.count({ title: { $in: ["a", "c"] } })).toBe(2);
  });

  it("only applies a versioned update when the version still matches", async () => {
    const s = await get();
    const p = newProject("w", "P", "u", "#000");
    const t = await s.tasks.insert(newTask({ project: p, title: "v1", createdBy: "u", order: 1 }));
    const won = await s.tasks.updateIfVersion(t.id, 1, { title: "first", version: 2 });
    const lost = await s.tasks.updateIfVersion(t.id, 1, { title: "second", version: 2 });
    expect(won?.title).toBe("first");
    expect(lost).toBeNull();
    expect((await s.tasks.get(t.id))?.title).toBe("first");
  });

  it("round-trips nulls, dates and arrays and removes by filter", async () => {
    const s = await get();
    const p = newProject("w", "P", "u", "#000");
    const t = newTask({ project: p, title: "x", createdBy: "u", order: 1, labels: ["a", "b"], dueDate: "2026-11-01" });
    await s.tasks.insert(t);
    const back = (await s.tasks.get(t.id))!;
    expect(back).toMatchObject({ assigneeId: null, completedAt: null, labels: ["a", "b"], dueDate: "2026-11-01" });
    expect(new Date(back.createdAt).getTime()).toBe(t.createdAt.getTime());
    expect(await s.tasks.removeWhere({ projectId: p.id })).toBe(1);
    expect(await s.tasks.get(t.id)).toBeNull();
  });
});

describe("ordering", () => {
  it("places cards between, above and below neighbours", () => {
    expect(orderBetween(null, null)).toBe(1024);
    expect(orderBetween(1024, null)).toBe(2048);
    expect(orderBetween(null, 1024)).toBe(0);
    expect(orderBetween(1024, 2048)).toBe(1536);
  });

  it("asks for a re-space only when neighbours are nearly equal", () => {
    expect(needsRespace(1, 1 + 1e-9)).toBe(true);
    expect(needsRespace(1, 2)).toBe(false);
    expect(needsRespace(null, 2)).toBe(false);
    expect(respaced(3)).toEqual([1024, 2048, 3072]);
  });
});
