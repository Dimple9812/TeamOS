/** Calendar dates are plain YYYY-MM-DD strings in the user's local time zone. */
export type Day = string;

const pad = (n: number) => String(n).padStart(2, "0");
export const toDay = (d: Date): Day => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromDay = (day: Day) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const today = (): Day => toDay(new Date());

export const addDays = (day: Day, n: number): Day => {
  const d = fromDay(day);
  d.setDate(d.getDate() + n);
  return toDay(d);
};
export const daysBetween = (from: Day, to: Day) => Math.round((fromDay(to).getTime() - fromDay(from).getTime()) / 86_400_000);
export const isWeekend = (day: Day) => [0, 6].includes(fromDay(day).getDay());

/** Six Monday-first weeks covering the month that contains `day`. */
export function monthGrid(day: Day): Day[][] {
  const first = fromDay(day);
  first.setDate(1);
  const offset = (first.getDay() + 6) % 7; // Monday = 0
  const start = toDay(new Date(first.getFullYear(), first.getMonth(), 1 - offset));
  return Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)));
}

export const sameMonth = (a: Day, b: Day) => a.slice(0, 7) === b.slice(0, 7);

export const monthLabel = (day: Day) => fromDay(day).toLocaleDateString(undefined, { month: "long", year: "numeric" });
export const shiftMonth = (day: Day, delta: number): Day => {
  const d = fromDay(day);
  return toDay(new Date(d.getFullYear(), d.getMonth() + delta, 1));
};

/** "Today", "Tomorrow", "3 days late", "Fri 31 Oct" — relative to `now`. */
export function dueLabel(due: Day, now: Day = today()) {
  const diff = daysBetween(now, due);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff < 0) return `${-diff} days late`;
  const d = fromDay(due);
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

/**
 * Spreads suggested tasks over working days from `start`, one after another,
 * each due when its estimate runs out. Weekends are skipped.
 */
export function schedule(estimates: number[], start: Day): Day[] {
  let cursor = start;
  while (isWeekend(cursor)) cursor = addDays(cursor, 1);
  return estimates.map((days) => {
    let left = Math.max(1, days) - 1;
    while (left > 0) {
      cursor = addDays(cursor, 1);
      if (!isWeekend(cursor)) left--;
    }
    const due = cursor;
    cursor = addDays(cursor, 1);
    while (isWeekend(cursor)) cursor = addDays(cursor, 1);
    return due;
  });
}

export function timeAgo(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
