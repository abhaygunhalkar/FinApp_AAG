import type { Ref } from 'react';

interface Props {
  onOpen: () => void;
  /** Bot messages that arrived while the panel was closed. */
  unread: number;
  /** Called on hover/focus, to start loading the panel early. */
  onPrefetch?: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
}

/** The floating button that opens the assistant. */
export default function ChatLauncher({ onOpen, unread, onPrefetch, buttonRef }: Props) {
  const label = unread > 0 ? `Open assistant, ${unread} unread` : 'Open assistant';
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={label}
      aria-haspopup="dialog"
      onClick={onOpen}
      onPointerEnter={onPrefetch}
      onFocus={onPrefetch}
      className="fixed bottom-5 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#0C1322] text-white shadow-[0_12px_30px_-8px_rgba(12,19,34,0.55)] transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1D4ED8] motion-reduce:transition-none motion-reduce:hover:scale-100 sm:bottom-6 sm:right-6 dark:ring-1 dark:ring-white/15"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6" aria-hidden="true">
        <path d="M4.8 3h14.4A2.8 2.8 0 0 1 22 5.8v9.4a2.8 2.8 0 0 1-2.8 2.8H9.6l-4.3 3.6A.8.8 0 0 1 4 21v-3H4.8A2.8 2.8 0 0 1 2 15.2V5.8A2.8 2.8 0 0 1 4.8 3Zm3 6.4a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6Zm4.2 0a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6Zm4.2 0a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6Z" />
      </svg>
      {unread > 0 && (
        <span
          aria-hidden="true"
          className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#F97316] px-1 text-[11px] font-bold text-white ring-2 ring-white dark:ring-slate-900"
        >
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </button>
  );
}
