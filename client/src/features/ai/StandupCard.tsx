import { useState } from "react";
import { errorMessage, useStandupQuery } from "../../app/api";
import { Button } from "../../components/ui/Button";
import { today } from "../../lib/dates";
import { SourceBadge } from "./SourceBadge";

/** Your standup, drafted from what you moved yesterday and what's on your plate today. */
export function StandupCard({ workspaceId }: { workspaceId: string }) {
  const { data, isFetching, error, refetch } = useStandupQuery({ workspaceId, today: today() });
  const [copied, setCopied] = useState(false);
  return (
    <section aria-labelledby="standup-h" className="rounded-xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 id="standup-h" className="text-[17px] font-semibold">
          Your standup
        </h2>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? "Drafting…" : "Redraft"}
          </Button>
          <Button
            size="sm"
            disabled={!data}
            onClick={async () => {
              await navigator.clipboard.writeText(data!.text);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-danger">{errorMessage(error)}</p>}
      {data && (
        <>
          <pre className="mt-3 font-sans text-sm leading-relaxed whitespace-pre-wrap">{data.text.replace(/^Standup — .*\n\n/, "")}</pre>
          <div className="mt-3">
            <SourceBadge source={data.source} note={data.note ?? (data.source === "template" ? "Drafted from your tasks and today's activity." : undefined)} />
          </div>
        </>
      )}
      {!data && !error && <p className="mt-3 text-sm text-muted">Drafting from your tasks…</p>}
    </section>
  );
}
