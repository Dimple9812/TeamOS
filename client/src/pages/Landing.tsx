import { Link } from "react-router-dom";
import { CalendarDays, MessageSquareText, Sparkles, Users } from "lucide-react";
import { Logo } from "../components/ui/Logo";
import { Button } from "../components/ui/Button";
import { useDemoLogin } from "../features/workspace/useDemoLogin";
import { STATUS_COLOR, STATUS_LABEL, type TaskStatus } from "../lib/types";

const SAMPLE: Record<TaskStatus, { title: string; who: string; tag?: string }[]> = {
  todo: [{ title: "Redirect map for old URLs", who: "AM", tag: "Urgent" }, { title: "Cookie banner", who: "PS" }],
  in_progress: [{ title: "Speed up checkout", who: "GY", tag: "Today" }, { title: "Accessibility audit", who: "PS" }],
  review: [{ title: "Build pricing page", who: "GY" }],
  done: [{ title: "Homepage copy", who: "PS" }, { title: "Analytics events", who: "AM" }],
};
const counts = { todo: 6, in_progress: 3, review: 2, done: 3 } as const;

/** A still of the product: the status ribbon and four columns, in the app's own colours. */
function BoardPreview() {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <div className="w-full max-w-xl rounded-xl border border-line bg-surface p-4 shadow-[var(--shadow-panel)]" aria-hidden="true">
      <div className="flex items-baseline justify-between">
        <p className="font-semibold">Website relaunch</p>
        <p className="text-[13px] text-muted">21% done</p>
      </div>
      <div className="mt-2 flex h-2 overflow-hidden rounded-full">
        {(Object.keys(counts) as TaskStatus[]).map((s) => (
          <span key={s} style={{ width: `${(counts[s] / total) * 100}%`, background: STATUS_COLOR[s] }} />
        ))}
      </div>
      <div className="mt-4 grid grid-cols-4 gap-2">
        {(Object.keys(SAMPLE) as TaskStatus[]).map((s) => (
          <div key={s} className="min-w-0">
            <p className="mb-2 flex items-center gap-1.5 truncate text-[12px] font-semibold text-muted">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: STATUS_COLOR[s] }} />
              {STATUS_LABEL[s]}
            </p>
            <div className="space-y-1.5">
              {SAMPLE[s].map((c) => (
                <div key={c.title} className="rounded-md border border-line bg-canvas/60 p-2">
                  <p className="text-[12px] leading-snug font-medium">{c.title}</p>
                  <div className="mt-1.5 flex items-center justify-between">
                    {c.tag ? <span className="text-[11px] font-semibold text-st-progress">{c.tag}</span> : <span />}
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-pine text-[8px] font-bold text-white">{c.who}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const FEATURES = [
  { icon: Users, title: "Everyone sees the same board, live", body: "Moves, edits and comments appear for teammates as they happen, with who's looking at which project." },
  { icon: CalendarDays, title: "Board, list or calendar", body: "Drag cards between columns, sort a list, or drag a task to a new day on the calendar." },
  { icon: Sparkles, title: "AI that works from your data", body: "Break a goal into tasks, summarise a project, or draft your standup — from the tasks and activity you already have." },
  { icon: MessageSquareText, title: "Roles that hold", body: "Owners, admins, members and viewers. Permissions are checked on the server, not just hidden in the UI." },
];

export default function Landing() {
  const demo = useDemoLogin();
  return (
    <div className="min-h-full">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Logo />
        <nav className="flex items-center gap-2">
          <Link to="/signin" className="rounded-lg px-3 py-2 text-sm font-semibold hover:bg-ink/5">
            Sign in
          </Link>
          <Link to="/signup" className="rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm font-semibold hover:bg-canvas">
            Create account
          </Link>
        </nav>
      </header>

      <main id="main">
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pt-10 pb-20 lg:grid-cols-[1fr_1.1fr]">
          <div className="max-w-xl">
            <h1 className="text-[clamp(2.4rem,5vw,3.6rem)] font-bold tracking-tight">Plan the work. Watch it move.</h1>
            <p className="mt-5 max-w-lg text-lg text-muted">
              TeamOS keeps a small team's projects on one live board. Assign work, drag it forward, talk about it on the card, and let AI turn a goal into a plan.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button variant="primary" onClick={demo.start} disabled={demo.busy} className="h-11 px-5 text-[15px]">
                {demo.label}
              </Button>
              <Link to="/signup" className="rounded-lg px-4 py-2.5 text-[15px] font-semibold text-pine hover:bg-pine-soft">
                Create an account
              </Link>
            </div>
            <p className="mt-3 text-[13px] text-muted">The demo opens a team workspace with two teammates and real work in progress. No sign-up.</p>
            {demo.error && (
              <p role="alert" className="mt-3 text-sm text-danger">
                {demo.error}
              </p>
            )}
          </div>
          <BoardPreview />
        </section>

        <section className="border-t border-line bg-surface">
          <div className="mx-auto grid max-w-6xl gap-x-12 gap-y-10 px-5 py-16 sm:grid-cols-2">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex gap-4">
                <Icon size={22} className="mt-0.5 shrink-0 text-pine" aria-hidden="true" />
                <div>
                  <h2 className="text-[17px] font-semibold">{title}</h2>
                  <p className="mt-1.5 max-w-md text-muted">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-8 text-sm text-muted">
        <p>Built with React, Redux Toolkit, Node.js, Express, MongoDB and Socket.IO.</p>
        <a href="https://github.com/Dimple9812/TeamOS" className="font-semibold text-ink underline underline-offset-4">
          Source on GitHub
        </a>
      </footer>
    </div>
  );
}
