export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 font-semibold tracking-tight text-ink">
      <svg width="24" height="24" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="var(--color-pine)" />
        <rect x="7" y="8" width="5" height="16" rx="1.5" fill="#f3f5f2" />
        <rect x="14" y="8" width="5" height="11" rx="1.5" fill="#f3f5f2" opacity=".8" />
        <rect x="21" y="8" width="5" height="7" rx="1.5" fill="#f3f5f2" opacity=".6" />
      </svg>
      {!compact && <span className="text-[17px]">TeamOS</span>}
    </span>
  );
}
