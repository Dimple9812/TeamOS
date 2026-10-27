import clsx from "clsx";
import { X } from "lucide-react";
import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { dismissToast, type Toast } from "../../app/uiSlice";

function ToastItem({ t }: { t: Toast }) {
  const dispatch = useAppDispatch();
  useEffect(() => {
    const timer = setTimeout(() => dispatch(dismissToast(t.id)), t.tone === "error" ? 7000 : 4500);
    return () => clearTimeout(timer);
  }, [t, dispatch]);
  return (
    <div
      className={clsx(
        "pointer-events-auto flex max-w-sm items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-[var(--shadow-lift)]",
        t.tone === "error" ? "border-danger/30 bg-danger-soft text-danger" : "border-line bg-ink text-white",
      )}
    >
      <p className="flex-1">{t.message}</p>
      <button type="button" aria-label="Dismiss" onClick={() => dispatch(dismissToast(t.id))} className="opacity-70 hover:opacity-100">
        <X size={16} />
      </button>
    </div>
  );
}

export function Toasts() {
  const toasts = useAppSelector((s) => s.ui.toasts);
  return (
    <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-50 flex flex-col items-end gap-2">
      {toasts.map((t) => (
        <ToastItem key={t.id} t={t} />
      ))}
    </div>
  );
}
