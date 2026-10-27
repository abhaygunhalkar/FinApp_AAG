import type { ReactNode } from 'react';

/** White card shell shared by every Dashboard section. */
export function Card({
  title,
  aside,
  children,
  className = '',
}: {
  title: string;
  /** Right side of the header: a note, legend or toggles. */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={title}
      className={`flex flex-col gap-2.5 rounded-[14px] border border-[#E4E7EC] bg-white px-4 py-3.5 dark:border-slate-700 dark:bg-slate-800 ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <h2 className="text-sm font-semibold text-[#0E1116] dark:text-white">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Grey placeholder block that pulses while data loads. */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-md bg-slate-200/80 dark:bg-slate-700 ${className}`}
    />
  );
}

/** Rows of skeleton lines, roughly the height of a list card's content. */
export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3 py-1" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-4" />
      ))}
    </div>
  );
}

/** Short centred message for a section with nothing to show yet. */
export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="flex flex-1 items-center justify-center py-6 text-center text-[13px] text-[#5B6472] dark:text-slate-400">
      {children}
    </p>
  );
}

/** Label/value row with a hairline divider above it. */
export function StatRow({
  label,
  value,
  strong = false,
  indent = false,
  valueClass = '',
}: {
  label: ReactNode;
  value: ReactNode;
  strong?: boolean;
  indent?: boolean;
  valueClass?: string;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 border-t border-[#F1F2F5] py-1.5 dark:border-slate-700 ${
        indent ? 'pl-3 text-xs' : 'text-[13px]'
      }`}
    >
      <span
        className={
          strong
            ? 'font-semibold text-[#0E1116] dark:text-white'
            : 'text-[#5B6472] dark:text-slate-400'
        }
      >
        {label}
      </span>
      <span
        className={`tabular-nums ${strong ? 'font-bold' : indent ? '' : 'font-semibold'} ${
          valueClass || 'text-[#0E1116] dark:text-white'
        }`}
      >
        {value}
      </span>
    </div>
  );
}
