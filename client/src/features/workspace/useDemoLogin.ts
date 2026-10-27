import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { errorMessage, useDemoMutation } from "../../app/api";

/** Starts a fresh demo workspace, waiting for the free-tier API to wake if it's asleep. */
export function useDemoLogin() {
  const [demo] = useDemoMutation();
  const navigate = useNavigate();
  const [status, setStatus] = useState<{ busy: boolean; waking: number | null; error: string | null }>({ busy: false, waking: null, error: null });

  const start = async () => {
    setStatus({ busy: true, waking: null, error: null });
    const began = Date.now();
    for (;;) {
      try {
        if ((await fetch("/api/health", { cache: "no-store" })).ok) break;
      } catch {
        /* asleep */
      }
      const s = Math.round((Date.now() - began) / 1000);
      if (s > 100) return setStatus({ busy: false, waking: null, error: "The server didn't wake up. Try again in a moment." });
      setStatus({ busy: true, waking: s, error: null });
      await new Promise((r) => setTimeout(r, 2000));
    }
    try {
      const r = await demo().unwrap();
      navigate(`/w/${r.workspaceId}/p/${r.projectId}`);
    } catch (e) {
      setStatus({ busy: false, waking: null, error: errorMessage(e) });
    }
  };

  const label = status.waking !== null ? `Waking the server… ${status.waking}s` : status.busy ? "Setting up your demo…" : "Try the demo";
  return { start, label, ...status };
}
