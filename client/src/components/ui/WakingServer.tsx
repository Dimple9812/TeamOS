import { useEffect, useState } from "react";
import { Logo } from "./Logo";

/**
 * The free API host sleeps when idle and takes up to a minute to wake.
 * Polls /health so a cold start reads as "waking up" instead of a broken site.
 */
export function useServerAwake() {
  const [state, setState] = useState<{ awake: boolean; seconds: number | null; failed: boolean }>({ awake: false, seconds: null, failed: false });
  useEffect(() => {
    let cancelled = false;
    const start = Date.now();
    (async () => {
      for (;;) {
        try {
          const res = await fetch("/api/health", { cache: "no-store" });
          if (res.ok) {
            if (!cancelled) setState({ awake: true, seconds: null, failed: false });
            return;
          }
        } catch {
          /* not up yet */
        }
        const seconds = Math.round((Date.now() - start) / 1000);
        if (cancelled) return;
        if (seconds > 100) return setState({ awake: false, seconds, failed: true });
        // Only mention the cold start once it's actually slow.
        setState({ awake: false, seconds: seconds >= 3 ? seconds : null, failed: false });
        await new Promise((r) => setTimeout(r, 2000));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

export function WakingServer({ seconds, failed }: { seconds: number | null; failed: boolean }) {
  return (
    <main className="flex h-full flex-col items-center justify-center gap-5 px-6 text-center">
      <Logo />
      {failed ? (
        <>
          <p className="max-w-sm text-muted">The server didn't respond. It may be redeploying.</p>
          <button type="button" className="font-semibold text-pine underline underline-offset-4" onClick={() => location.reload()}>
            Try again
          </button>
        </>
      ) : (
        <div role="status" className="flex flex-col items-center gap-3">
          <span className="h-1.5 w-40 overflow-hidden rounded-full bg-line">
            <span className="block h-full w-1/3 animate-[slide_1.1s_ease-in-out_infinite] rounded-full bg-pine" />
          </span>
          <p className="max-w-sm text-muted">
            {seconds === null ? "Loading" : `Waking the server — free hosting sleeps when idle. This takes up to a minute (${seconds}s).`}
          </p>
        </div>
      )}
      <style>{`@keyframes slide { from { transform: translateX(-100%) } to { transform: translateX(300%) } }`}</style>
    </main>
  );
}
