import { addDays, dueLabel, monthGrid, schedule, timeAgo } from "./dates";

describe("dates", () => {
  it("builds a six-week, Monday-first month grid", () => {
    const grid = monthGrid("2026-10-15");
    expect(grid).toHaveLength(6);
    expect(grid[0][0]).toBe("2026-09-28"); // the Monday before 1 Oct (a Thursday)
    expect(grid.flat()).toContain("2026-10-31");
  });

  it("adds days across month boundaries", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
  });

  it("labels due dates relative to today", () => {
    expect(dueLabel("2026-10-27", "2026-10-27")).toBe("Today");
    expect(dueLabel("2026-10-28", "2026-10-27")).toBe("Tomorrow");
    expect(dueLabel("2026-10-24", "2026-10-27")).toBe("3 days late");
  });

  it("schedules tasks back to back on weekdays", () => {
    // Fri 30 Oct 2026: a 1-day task is due Friday, a 2-day task then runs Mon–Tue.
    expect(schedule([1, 2, 1], "2026-10-30")).toEqual(["2026-10-30", "2026-11-03", "2026-11-04"]);
    // Starting on a Saturday moves to Monday.
    expect(schedule([1], "2026-10-31")).toEqual(["2026-11-02"]);
  });

  it("formats time ago", () => {
    const now = Date.parse("2026-10-27T12:00:00Z");
    expect(timeAgo("2026-10-27T11:59:50Z", now)).toBe("just now");
    expect(timeAgo("2026-10-27T11:30:00Z", now)).toBe("30 min ago");
    expect(timeAgo("2026-10-27T09:00:00Z", now)).toBe("3 h ago");
  });
});
