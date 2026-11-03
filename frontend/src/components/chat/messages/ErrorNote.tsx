import type { ReactNode } from 'react';

/** Something the bot or the app couldn't do. */
export default function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-[85%] rounded-2xl rounded-tl-md border border-orange-200 bg-orange-50 px-3.5 py-2.5 text-sm text-[#9A3412] dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-200">
      <span aria-hidden="true">⚠ </span>
      <span className="sr-only">Error: </span>
      {children}
    </div>
  );
}
