interface StaleBannerProps {
  count: number;
  onUpdate: () => void;
}

/** One quiet line when some balances are out of date, with the way to fix them. */
export default function StaleBanner({ count, onUpdate }: StaleBannerProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 sm:px-5 dark:border-amber-500/25 dark:bg-amber-500/10">
      <div className="flex min-w-0 items-center gap-3">
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5Z"
            clipRule="evenodd"
          />
        </svg>
        <p className="text-sm text-slate-700 dark:text-slate-200">
          <span className="font-semibold">
            {count} balance{count === 1 ? '' : 's'} need{count === 1 ? 's' : ''} a check
          </span>
          <span className="hidden sm:inline text-slate-500 dark:text-slate-400">
            {' '}
            · confirm or update them to keep your net worth accurate
          </span>
        </p>
      </div>
      <button
        type="button"
        onClick={onUpdate}
        className="h-9 shrink-0 rounded-full bg-ink-900 px-4 text-sm font-semibold text-white hover:bg-ink-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-700"
      >
        Update balances
      </button>
    </div>
  );
}
