import type { Priority } from "../store/types.js";
import type { ProjectStats, StandupItem, SuggestedTask, SummaryText } from "./types.js";

type Step = [title: string, priority: Priority, days: number, description?: string];

/**
 * Playbooks used when no AI key is configured (or the model's answer fails validation).
 * Each is a realistic sequence a team would actually follow for that kind of goal.
 */
const PLAYBOOKS: { match: RegExp; steps: (goal: string) => Step[] }[] = [
  {
    match: /\b(bug|fix|incident|outage|crash|slow|performance|latency|error)s?\b/i,
    steps: (g) => [
      [`Reproduce the problem: ${g}`, "urgent", 1, "Write down exact steps, environment and expected vs actual result."],
      ["Find the root cause", "high", 2, "Check logs, recent deploys and metrics; confirm the cause with a failing test."],
      ["Ship the fix", "high", 1],
      ["Add a regression test", "medium", 1, "The test should fail without the fix."],
      ["Deploy and monitor for 24 hours", "medium", 1],
      ["Write a short postmortem", "low", 1, "What happened, why, and what prevents it next time."],
    ],
  },
  {
    match: /\b(hire|hiring|recruit|recruiting|interview|onboard)\w*/i,
    steps: (g) => [
      [`Write the role description for: ${g}`, "high", 1, "Responsibilities, must-haves, nice-to-haves, level and salary band."],
      ["Post the role and ask the team for referrals", "medium", 1],
      ["Screen applicants", "medium", 3],
      ["Run interview loop", "high", 5, "Agree on the interview panel and a scorecard first."],
      ["Debrief and make an offer", "high", 1],
      ["Prepare onboarding plan for week one", "medium", 2],
    ],
  },
  {
    match: /\b(event|meetup|conference|workshop|webinar|offsite|hackathon)s?\b/i,
    steps: (g) => [
      [`Set date, format and budget for ${g}`, "high", 1],
      ["Book venue or streaming setup", "high", 2],
      ["Confirm speakers and agenda", "high", 3],
      ["Publish registration page", "medium", 1],
      ["Promote on social channels and newsletter", "medium", 3],
      ["Prepare logistics checklist", "medium", 1, "Food, AV, badges, accessibility, backup plan."],
      ["Send thank-you note and feedback survey", "low", 1],
    ],
  },
  {
    match: /\b(migrat\w*|upgrade|move to|switch to|replatform)\b/i,
    steps: (g) => [
      [`Inventory everything affected by: ${g}`, "high", 2],
      ["Write migration plan with rollback steps", "high", 2],
      ["Rehearse on a staging copy", "high", 2],
      ["Migrate data and verify counts", "urgent", 1],
      ["Cut over and monitor", "high", 1],
      ["Decommission the old setup", "low", 1],
    ],
  },
  {
    match: /\b(marketing|campaign|launch|promo\w*|growth|newsletter|seo|brand)\b/i,
    steps: (g) => [
      [`Define audience and key message for ${g}`, "high", 1],
      ["Pick channels and set the budget", "medium", 1],
      ["Create content: copy, visuals, landing page", "high", 4],
      ["Schedule posts and emails", "medium", 1],
      ["Go live", "urgent", 1],
      ["Track results and report after one week", "medium", 1, "Reach, sign-ups, conversion, cost per result."],
    ],
  },
  {
    match: /\b(website|landing page|site|homepage|portfolio|blog)\b/i,
    steps: (g) => [
      [`Agree goals and audience for ${g}`, "high", 1],
      ["Draft sitemap and page copy", "medium", 2],
      ["Design wireframes for desktop and mobile", "medium", 2],
      ["Build responsive pages", "high", 4],
      ["Add analytics, SEO tags and accessibility checks", "medium", 1],
      ["QA on real devices and fix issues", "high", 1],
      ["Launch and announce", "medium", 1],
    ],
  },
  {
    match: /\b(app|feature|api|backend|frontend|dashboard|integration|service|module|login|auth|payment)s?\b/i,
    steps: (g) => [
      [`Write spec and acceptance criteria: ${g}`, "high", 1],
      ["Design the data model and API", "high", 2],
      ["Implement the backend endpoints", "high", 3],
      ["Build the UI", "high", 3],
      ["Write automated tests", "medium", 2],
      ["Code review and fixes", "medium", 1],
      ["Release behind a feature flag and monitor", "medium", 1],
    ],
  },
  {
    match: /\b(research|study|survey|analy\w*|report|investigat\w*)\b/i,
    steps: (g) => [
      [`Frame the questions for: ${g}`, "high", 1],
      ["Collect data and sources", "medium", 3],
      ["Analyse and find patterns", "high", 2],
      ["Write findings and recommendations", "high", 2],
      ["Share with the team and agree next steps", "medium", 1],
    ],
  },
];

const shorten = (goal: string, max = 70) => {
  let g = goal.replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "");
  // The goal is dropped mid-sentence, so "Launch the…" becomes "launch the…" (but "API…" or "iOS…" stay as written).
  if (/^[A-Z][a-z]/.test(g)) g = g[0].toLowerCase() + g.slice(1);
  return g.length > max ? `${g.slice(0, max - 1).trimEnd()}…` : g;
};

export function templateBreakdown(goal: string): SuggestedTask[] {
  const g = shorten(goal);
  const playbook = PLAYBOOKS.find((p) => p.match.test(goal));
  const steps: Step[] = playbook
    ? playbook.steps(g)
    : [
        [`Define what "done" means for: ${g}`, "high", 1, "Write the outcome and how you'll measure it."],
        ["Split the work into milestones", "medium", 1],
        ["Complete the first milestone", "high", 3],
        ["Review progress with the team", "medium", 1],
        ["Finish the remaining milestones", "medium", 4],
        ["Wrap up and share results", "low", 1],
      ];
  return steps.map(([title, priority, estimateDays, description = ""]) => ({ title, priority, estimateDays, description }));
}

/** "Tue 27 Oct" — the date only, read in UTC so it never shifts by a day. */
export const friendlyDay = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

const list = (titles: string[], max = 3) => {
  const shown = titles.slice(0, max).map((t) => `"${t}"`);
  return titles.length > max ? `${shown.join(", ")} and ${titles.length - max} more` : shown.join(", ");
};

export interface SummaryFacts {
  projectName: string;
  stats: ProjectStats;
  completedThisWeek: string[];
  inReview: string[];
  overdue: { title: string; assignee: string | null; daysLate: number }[];
  urgentNotStarted: string[];
  unassignedHigh: string[];
  upcoming: { title: string; dueDate: string; assignee: string | null }[];
}

export function templateSummary(f: SummaryFacts): SummaryText {
  const s = f.stats;
  const headline =
    s.total === 0
      ? `${f.projectName} has no tasks yet.`
      : `${f.projectName} is ${s.percentDone}% done: ${s.done} of ${s.total} tasks complete${s.overdue ? `, ${s.overdue} overdue` : ""}.`;

  const highlights: string[] = [];
  if (f.completedThisWeek.length) highlights.push(`Finished this week: ${list(f.completedThisWeek)}.`);
  if (s.inProgress) highlights.push(`${s.inProgress} task${s.inProgress === 1 ? "" : "s"} in progress.`);
  if (f.inReview.length) highlights.push(`Waiting for review: ${list(f.inReview)}.`);

  const risks: string[] = [];
  for (const o of f.overdue.slice(0, 3)) {
    risks.push(`"${o.title}" is ${o.daysLate} day${o.daysLate === 1 ? "" : "s"} overdue${o.assignee ? ` (${o.assignee})` : " and unassigned"}.`);
  }
  if (f.urgentNotStarted.length) risks.push(`Urgent but not started: ${list(f.urgentNotStarted)}.`);
  if (f.unassignedHigh.length) risks.push(`High priority with no owner: ${list(f.unassignedHigh)}.`);

  const next = f.upcoming.slice(0, 3).map((u) => `"${u.title}" is due ${friendlyDay(u.dueDate)}${u.assignee ? ` (${u.assignee})` : ""}.`);
  if (!next.length && s.todo) next.push(`Pick up the next of ${s.todo} task${s.todo === 1 ? "" : "s"} in To do.`);
  return { headline, highlights: highlights.slice(0, 5), risks: risks.slice(0, 5), next: next.slice(0, 5) };
}

export function templateStandup(name: string, y: StandupItem[], t: StandupItem[], b: StandupItem[]) {
  const line = (items: StandupItem[], empty: string) =>
    items.length ? items.map((i) => `• ${i.title}${i.detail ? ` (${i.detail})` : ""}`).join("\n") : `• ${empty}`;
  return [
    `Standup — ${name}`,
    "",
    "Yesterday",
    line(y, "No tasks moved yesterday."),
    "",
    "Today",
    line(t, "Nothing in progress — picking up the next task from To do."),
    "",
    "Blockers",
    line(b, "None."),
  ].join("\n");
}
