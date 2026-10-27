import { sortTasks } from "../features/tasks/ListView";
import { safeNext } from "./redirect";
import { applyFilter, isFiltering, readFilter } from "./filters";
import type { Task } from "./types";

const t = (over: Partial<Task>): Task => ({
  id: Math.random().toString(36).slice(2), status: "todo", order: 1, version: 1, workspaceId: "w", projectId: "p", title: "t", description: "",
  priority: "medium", assigneeId: null, dueDate: null, labels: [], createdBy: "u", completedAt: null, createdAt: "", updatedAt: "", ...over,
});

describe("filters", () => {
  const tasks = [
    t({ title: "Fix login", assigneeId: "me", priority: "urgent" }),
    t({ title: "Write docs", labels: ["content"], assigneeId: "bob" }),
    t({ title: "Unowned", priority: "low" }),
  ];

  it("reads filters from the URL and ignores bad values", () => {
    expect(readFilter(new URLSearchParams("q=docs&priority=bogus&assignee=me"))).toEqual({ q: "docs", assignee: "me", priority: "" });
    expect(isFiltering(readFilter(new URLSearchParams("")))).toBe(false);
  });

  it("filters by text in titles and labels, assignee and priority", () => {
    const f = (q: string) => applyFilter(tasks, readFilter(new URLSearchParams(q)), "me").map((x) => x.title);
    expect(f("q=content")).toEqual(["Write docs"]);
    expect(f("assignee=me")).toEqual(["Fix login"]);
    expect(f("assignee=none")).toEqual(["Unowned"]);
    expect(f("assignee=bob")).toEqual(["Write docs"]);
    expect(f("priority=urgent")).toEqual(["Fix login"]);
  });
});

describe("list sorting", () => {
  it("sorts by due date with undated tasks last in both directions", () => {
    const rows = [t({ title: "none" }), t({ title: "late", dueDate: "2026-10-01" }), t({ title: "soon", dueDate: "2026-11-01" })];
    expect(sortTasks(rows, "dueDate", 1, new Map()).map((x) => x.title)).toEqual(["late", "soon", "none"]);
    expect(sortTasks(rows, "dueDate", -1, new Map()).map((x) => x.title)).toEqual(["soon", "late", "none"]);
  });

  it("sorts by priority, most urgent first", () => {
    const rows = [t({ title: "low", priority: "low" }), t({ title: "urgent", priority: "urgent" }), t({ title: "high", priority: "high" })];
    expect(sortTasks(rows, "priority", 1, new Map()).map((x) => x.title)).toEqual(["urgent", "high", "low"]);
  });
});

describe("post-login redirect", () => {
  it("only allows same-site paths", () => {
    expect(safeNext("/w/abc")).toBe("/w/abc");
    expect(safeNext("//evil.com")).toBe("/app");
    expect(safeNext("/\\evil.com")).toBe("/app");
    expect(safeNext("https://evil.com")).toBe("/app");
  });
});
