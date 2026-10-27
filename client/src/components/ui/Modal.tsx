import { X } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef } from "react";
import clsx from "clsx";

/**
 * Native <dialog>: focus is trapped and restored by the browser, Escape closes it,
 * and the rest of the page is inert while it's open.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  width = "max-w-lg",
  side = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: string;
  /** Slide-over panel on the right instead of a centred dialog. */
  side?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={clsx(
        "bg-surface text-ink shadow-[var(--shadow-panel)] backdrop:bg-ink/30",
        side
          ? "fixed inset-y-0 right-0 left-auto m-0 h-full max-h-none w-full max-w-xl"
          : clsx("m-auto w-[calc(100%-2rem)] rounded-xl", width),
      )}
    >
      {open && (
        <div className={clsx("flex flex-col", side && "h-full")}>
          <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            <button type="button" onClick={onClose} aria-label="Close" className="-m-1 rounded-md p-1 text-muted hover:bg-ink/5 hover:text-ink">
              <X size={18} />
            </button>
          </header>
          <div className={clsx("px-5 py-4", side && "min-h-0 flex-1 overflow-y-auto")}>{children}</div>
        </div>
      )}
    </dialog>
  );
}
