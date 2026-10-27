import { applyMove, groupByStatus, neighboursAt, orderBetween, upsertTask } from "./board";
import type { Task } from "./types";

const t = (id: string, status: Task["status"], order: number, version = 1): Task => ({
  id, status, order, version, workspaceId: "w", projectId: "p", title: id, description: "", priority: "medium",
  assigneeId: null, dueDate: null, labels: [], createdBy: "u", completedAt: null, createdAt: "", updatedAt: "",
});

describe("board ordering", () => {
  it("groups by status and sorts each column by order", () => {
    const cols = groupByStatus([t("b", "todo", 2048), t("a", "todo", 1024), t("c", "done", 5)]);
    expect(cols.todo.map((x) => x.id)).toEqual(["a", "b"]);
    expect(cols.done.map((x) => x.id)).toEqual(["c"]);
    expect(cols.review).toEqual([]);
  });

  it("matches the server's ordering rule", () => {
    expect(orderBetween(null, null)).toBe(1024);
    expect(orderBetween(1024, 2048)).toBe(1536);
    expect(orderBetween(null, 1024)).toBe(0);
  });

  it("finds the neighbours of a drop position", () => {
    const col = [t("a", "todo", 1), t("b", "todo", 2)];
    expect(neighboursAt(col, 0)).toEqual({ prev: null, next: col[0] });
    expect(neighboursAt(col, 1)).toEqual({ prev: col[0], next: col[1] });
    expect(neighboursAt(col, 2)).toEqual({ prev: col[1], next: null });
  });

  it("applies a move optimistically, including completedAt for Done", () => {
    const tasks = [t("a", "todo", 1024), t("b", "todo", 2048), t("x", "in_progress", 1024)];
    const between = applyMove(tasks, "x", "todo", "a", "b");
    expect(groupByStatus(between).todo.map((x) => x.id)).toEqual(["a", "x", "b"]);
    const done = applyMove(tasks, "a", "done", null, null);
    expect(done.find((x) => x.id === "a")!.completedAt).toBeTruthy();
  });

  it("ignores realtime echoes older than what we already have", () => {
    const tasks = [t("a", "todo", 1, 3)];
    expect(upsertTask(tasks, { ...t("a", "done", 1, 2) })[0].status).toBe("todo");
    expect(upsertTask(tasks, { ...t("a", "done", 1, 4) })[0].status).toBe("done");
    expect(upsertTask(tasks, t("new", "todo", 5))).toHaveLength(2);
  });
});
