import clsx from "clsx";

const PALETTE = ["#1f5f4e", "#6d4fd8", "#c47f12", "#2563eb", "#b4235a", "#0f766e", "#7c4a03", "#475569"];

/** Stable colour per person, so the same teammate looks the same everywhere. */
export function colorFor(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export const initials = (name: string) =>
  name
    .replace(/\(.*?\)/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "?";

export function Avatar({ id, name, size = 24, ring = false, className }: { id: string; name: string; size?: number; ring?: boolean; className?: string }) {
  return (
    <span
      title={name}
      aria-label={name}
      role="img"
      className={clsx("inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white select-none", ring && "ring-2 ring-surface", className)}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.42), background: colorFor(id) }}
    >
      {initials(name)}
    </span>
  );
}
