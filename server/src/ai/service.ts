import type { Config } from "../config.js";
import type { Activity, Project, Task, User } from "../store/types.js";
import { asData, completeJson, type FetchLike } from "./llm.js";
import { type SummaryFacts, templateBreakdown, templateStandup, templateSummary } from "./templates.js";
import {
  type AiSource, breakdownSchema, type ProjectStats, type ProjectSummary, type Standup, type StandupItem,
  standupTextSchema, type SuggestedTask, summaryTextSchema,
} from "./types.js";

const DAY = 86_400_000;
const toDay = (d: Date) => d.toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY);

/** Every number the model writes must already appear in the facts we gave it; otherwise its text is discarded. */
export function numbersAreGrounded(text: string, facts: string) {
  const known = new Set(facts.match(/\d+(?:\.\d+)?/g) ?? []);
  return (text.match(/\d+(?:\.\d+)?/g) ?? []).every((n) => known.has(n));
}

export interface AiResult<T> {
  value: T;
  source: AiSource;
  /** Why the template was used instead of the model, when it was. */
  note?: string;
}

export class AiService {
  private usage = new Map<string, { day: string; count: number }>();

  constructor(private cfg: Config["ai"], private fetchImpl: FetchLike = fetch) {}

  status() {
    return { provider: this.cfg.provider, model: this.cfg.provider === "template" ? null : this.cfg.model, dailyLimit: this.cfg.dailyLimit };
  }

  /** Counts a model call against the user's daily allowance. Template answers are free and unlimited. */
  private take(userId: string) {
    const day = toDay(new Date());
    const u = this.usage.get(userId);
    const used = u?.day === day ? u.count : 0;
    if (used >= this.cfg.dailyLimit) return false;
    this.usage.set(userId, { day, count: used + 1 });
    return true;
  }

  private async withModel<T>(userId: string, run: () => Promise<T>, fallback: () => T): Promise<AiResult<T>> {
    if (this.cfg.provider === "template") return { value: fallback(), source: "template" };
    if (!this.take(userId)) return { value: fallback(), source: "template", note: "Daily AI limit reached, so this uses the built-in planner." };
    try {
      return { value: await run(), source: "ai" };
    } catch (e) {
      console.warn("AI fallback:", (e as Error).message);
      return { value: fallback(), source: "template", note: "The AI answer couldn't be used, so this uses the built-in planner." };
    }
  }

  async breakdown(userId: string, project: Project, goal: string, existingTitles: string[]): Promise<AiResult<SuggestedTask[]>> {
    return this.withModel(
      userId,
      async () => {
        const prompt = [
          "Break the goal below into 4-8 concrete, ordered tasks a small team can assign. Avoid duplicating existing tasks.",
          'Return {"tasks":[{"title":string (imperative, max 100 chars),"description":string (one sentence),"priority":"low"|"medium"|"high"|"urgent","estimateDays":integer 1-10}]}.',
          asData("project_data", JSON.stringify({ project: project.name, existingTasks: existingTitles.slice(0, 40) })),
          asData("user_input", goal),
        ].join("\n\n");
        const parsed = breakdownSchema.parse(await completeJson(this.cfg, prompt, this.fetchImpl));
        const existing = new Set(existingTitles.map((t) => t.toLowerCase()));
        const fresh = parsed.tasks.filter((t) => !existing.has(t.title.toLowerCase()));
        if (fresh.length < 3) throw new Error("Model only repeated existing tasks");
        return fresh;
      },
      () => templateBreakdown(goal),
    );
  }

  async summary(userId: string, project: Project, tasks: Task[], people: Map<string, string>, today: string): Promise<ProjectSummary> {
    const facts = summaryFacts(project, tasks, people, today);
    const result = await this.withModel(
      userId,
      async () => {
        const factsJson = JSON.stringify(facts);
        const prompt = [
          "Write a short status summary for a project lead from these facts.",
          'Return {"headline":string,"highlights":string[] (max 4),"risks":string[] (max 4),"next":string[] (max 3)}. Each item one short sentence. Use only these facts.',
          asData("project_data", factsJson),
        ].join("\n\n");
        const parsed = summaryTextSchema.parse(await completeJson(this.cfg, prompt, this.fetchImpl));
        const allText = [parsed.headline, ...parsed.highlights, ...parsed.risks, ...parsed.next].join(" ");
        if (!numbersAreGrounded(allText, factsJson)) throw new Error("Summary contained numbers that are not in the data");
        return parsed;
      },
      () => templateSummary(facts),
    );
    return { ...result.value, stats: facts.stats, source: result.source, generatedAt: new Date().toISOString() };
  }

  async standup(
    user: User, tasks: Task[], projects: Project[], activity: Activity[], today: string,
  ): Promise<Standup & { note?: string }> {
    const items = standupItems(user.id, tasks, projects, activity, today);
    const fallback = () => templateStandup(user.name, items.yesterday, items.today, items.blockers);
    const result = await this.withModel(
      user.id,
      async () => {
        const factsJson = JSON.stringify({ name: user.name, ...items });
        const prompt = [
          "Write a concise daily standup update in first person from these facts, with three short sections: Yesterday, Today, Blockers.",
          'Return {"text":string}. Plain text, bullet lines starting with "• ". Use only these facts.',
          asData("project_data", factsJson),
        ].join("\n\n");
        const { text } = standupTextSchema.parse(await completeJson(this.cfg, prompt, this.fetchImpl));
        if (!numbersAreGrounded(text, factsJson)) throw new Error("Standup contained numbers that are not in the data");
        return text;
      },
      fallback,
    );
    return { ...items, text: result.value, source: result.source, note: result.note, generatedAt: new Date().toISOString() };
  }
}

export function projectStats(tasks: Task[], today: string): ProjectStats {
  const weekAgo = Date.parse(today) - 6 * DAY;
  const by = (s: Task["status"]) => tasks.filter((t) => t.status === s).length;
  const open = tasks.filter((t) => t.status !== "done");
  const done = by("done");
  return {
    total: tasks.length,
    todo: by("todo"),
    inProgress: by("in_progress"),
    review: by("review"),
    done,
    overdue: open.filter((t) => t.dueDate && t.dueDate < today).length,
    dueThisWeek: open.filter((t) => t.dueDate && t.dueDate >= today && daysBetween(today, t.dueDate) <= 6).length,
    completedThisWeek: tasks.filter((t) => t.completedAt && new Date(t.completedAt).getTime() >= weekAgo).length,
    percentDone: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
  };
}

export function summaryFacts(project: Project, tasks: Task[], people: Map<string, string>, today: string): SummaryFacts {
  const weekAgo = Date.parse(today) - 6 * DAY;
  const name = (id: string | null) => (id ? (people.get(id) ?? null) : null);
  const open = tasks.filter((t) => t.status !== "done");
  return {
    projectName: project.name,
    stats: projectStats(tasks, today),
    completedThisWeek: tasks
      .filter((t) => t.completedAt && new Date(t.completedAt).getTime() >= weekAgo)
      .sort((a, b) => +new Date(b.completedAt!) - +new Date(a.completedAt!))
      .map((t) => t.title),
    inReview: tasks.filter((t) => t.status === "review").map((t) => t.title),
    overdue: open
      .filter((t) => t.dueDate && t.dueDate < today)
      .map((t) => ({ title: t.title, assignee: name(t.assigneeId), daysLate: daysBetween(t.dueDate!, today) }))
      .sort((a, b) => b.daysLate - a.daysLate),
    urgentNotStarted: open.filter((t) => t.priority === "urgent" && t.status === "todo").map((t) => t.title),
    unassignedHigh: open.filter((t) => !t.assigneeId && (t.priority === "high" || t.priority === "urgent")).map((t) => t.title),
    upcoming: open
      .filter((t) => t.dueDate && t.dueDate >= today)
      .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))
      .map((t) => ({ title: t.title, dueDate: t.dueDate!, assignee: name(t.assigneeId) })),
  };
}

const STATUS_LABEL: Record<Task["status"], string> = { todo: "To do", in_progress: "In progress", review: "In review", done: "Done" };

/** What the user did yesterday, is doing today and is blocked on, from their tasks and the activity log. */
export function standupItems(userId: string, tasks: Task[], projects: Project[], activity: Activity[], today: string) {
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const since = Date.parse(today) - DAY;
  const item = (t: Task, detail?: string): StandupItem => ({ taskId: t.id, title: t.title, projectName: projectName.get(t.projectId) ?? "", detail });

  const yesterdayIds = new Map<string, string>();
  for (const a of activity) {
    if (a.actorId !== userId || !a.taskId || new Date(a.createdAt).getTime() < since) continue;
    if (a.type === "task.moved") yesterdayIds.set(a.taskId, `moved to ${STATUS_LABEL[a.data.to as Task["status"]] ?? a.data.to}`);
    else if (a.type === "task.created" && !yesterdayIds.has(a.taskId)) yesterdayIds.set(a.taskId, "created");
    else if (a.type === "comment.added" && !yesterdayIds.has(a.taskId)) yesterdayIds.set(a.taskId, "commented");
  }
  for (const t of tasks) {
    if (t.assigneeId === userId && t.completedAt && new Date(t.completedAt).getTime() >= since) yesterdayIds.set(t.id, "done");
  }
  const yesterday = [...yesterdayIds].flatMap(([id, detail]) => (taskById.get(id) ? [item(taskById.get(id)!, detail)] : []));

  const mine = tasks.filter((t) => t.assigneeId === userId && t.status !== "done");
  const todayItems = mine
    .filter((t) => t.status === "in_progress" || t.status === "review" || t.dueDate === today)
    .map((t) => item(t, t.status === "review" ? "in review" : t.dueDate === today ? "due today" : undefined));
  const blockers = mine
    .filter((t) => (t.dueDate && t.dueDate < today) || (t.priority === "urgent" && t.status === "todo"))
    .map((t) => item(t, t.dueDate && t.dueDate < today ? `${daysBetween(t.dueDate, today)}d overdue` : "urgent, not started"));

  return { yesterday: yesterday.slice(0, 8), today: todayItems.slice(0, 8), blockers: blockers.slice(0, 5) };
}
