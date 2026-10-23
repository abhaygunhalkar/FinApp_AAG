import type { ReactNode } from 'react';
import { categoryColor } from './constants';

const ICONS: Partial<Record<string, ReactNode>> = {
  Housing: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  'Auto loans': (
    <>
      <path d="M19 17h2a1 1 0 0 0 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4a1 1 0 0 0 1 1h2" />
      <circle cx="7" cy="17" r="2" />
      <path d="M9 17h6" />
      <circle cx="17" cy="17" r="2" />
    </>
  ),
  Insurance: <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" />,
  'Health & fitness': <path d="M6 7v10M18 7v10M3 9v6M21 9v6M6 12h12" />,
  Subscriptions: (
    <>
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
      <path d="m7 22-4-4 4-4" />
      <path d="M21 13v1a4 4 0 0 1-4 4H3" />
    </>
  ),
  'Kids activities': (
    <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
  ),
  'Savings & investing': (
    <>
      <path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8 0 3 2 4.5V20h4v-2h3v2h4v-4c1-.5 1.7-1 2-2h2v-4h-2c0-1-.5-1.5-1-2V5z" />
      <path d="M2 9v1c0 1.1.9 2 2 2h1" />
      <path d="M16 11h.01" />
    </>
  ),
};

/** "Debt payments" → "DP", "Utilities" → "UT". */
function initials(category: string): string {
  const words = category.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w));
  const letters = words.length > 1 ? words[0][0] + words[1][0] : category.slice(0, 2);
  return letters.toUpperCase();
}

/** 36px rounded square: category colour at ~12% behind its icon (or initials). */
export default function CategoryBadge({ category }: { category: string }) {
  const color = categoryColor(category);
  const icon = ICONS[category];
  return (
    <span
      className="h-9 w-9 shrink-0 rounded-lg flex items-center justify-center text-xs font-bold"
      style={{ background: `${color}1F`, color }}
      aria-hidden="true"
    >
      {icon ? (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-[18px] w-[18px]"
        >
          {icon}
        </svg>
      ) : (
        initials(category)
      )}
    </span>
  );
}
