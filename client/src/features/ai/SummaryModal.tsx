import { useEffect, useState } from "react";
import { errorMessage, useLazySummaryQuery } from "../../app/api";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { today } from "../../lib/dates";
import type { ProjectSummary } from "../../lib/types";
import { SourceBadge } from "./SourceBadge";

export function summaryAsText(s: ProjectSummary) {
  const block = (title: string, items: string[]) => (items.length ? [`${title}:`, ...items.map((i) => `- ${i}`), ""] : []);
  return [s.headline, "", ...block("Highlights", s.highlights), ...block("Risks", s.risks), ...block("Next up", s.next)].join("\n").trim();
}

function Section({ title, items, tone }: { title: string; items: string[]; tone?: "risk" }) {
  if (!items.length) return null;
  return (
    <section>
      <h3 className={tone === "risk" ? "text-sm font-semibold text-danger" : "text-sm font-semibold"}>{title}</h3>
      <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </section>
  );
}

export function SummaryModal({ projectId, open, onClose }: { projectId: string; open: boolean; onClose: () => void }) {
  const [load, { data, isFetching, error }] = useLazySummaryQuery();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) load({ projectId, today: today() });
  }, [open, projectId, load]);

  const stats = data?.stats;
  return (
    <Modal open={open} onClose={onClose} title="Project summary" width="max-w-xl">
      {isFetching && <p className="text-muted">Reading the project…</p>}
      {error && !isFetching && (
        <p role="alert" className="text-danger">
          {errorMessage(error)}
        </p>
      )}
      {data && !isFetching && (
        <div className="space-y-5">
          <p className="text-lg font-semibold">{data.headline}</p>
          {stats && (
            <dl className="grid grid-cols-3 gap-2 text-center sm:grid-cols-5">
              {[
                ["Done", stats.done],
                ["In progress", stats.inProgress],
                ["In review", stats.review],
                ["Overdue", stats.overdue],
                ["Due this week", stats.dueThisWeek],
              ].map(([label, n]) => (
                <div key={label} className="rounded-lg bg-canvas px-2 py-2">
                  <dd className="text-xl font-semibold">{n}</dd>
                  <dt className="text-[12px] text-muted">{label}</dt>
                </div>
              ))}
            </dl>
          )}
          <Section title="Highlights" items={data.highlights} />
          <Section title="Risks" items={data.risks} tone="risk" />
          <Section title="Next up" items={data.next} />
          <SourceBadge source={data.source} />
          <div className="flex justify-end gap-2">
            <Button onClick={() => load({ projectId, today: today() })}>Refresh</Button>
            <Button
              variant="primary"
              onClick={async () => {
                await navigator.clipboard.writeText(summaryAsText(data));
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? "Copied" : "Copy summary"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
