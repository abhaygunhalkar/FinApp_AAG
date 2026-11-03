import { useCallback, useEffect, useRef } from 'react';
import { EXAMPLE_QUESTIONS } from './examples';
import InputBox from './InputBox';
import MessageList from './MessageList';
import type { ChatEntry, ChatHandlers } from './types';
import { useFocusTrap } from './useFocusTrap';

export interface ChatPanelProps extends ChatHandlers {
  state: 'open' | 'minimized';
  entries: ChatEntry[];
  pending: boolean;
  hidden: boolean;
  onClose: () => void;
  onMinimize: () => void;
  onExpand: () => void;
}

const iconButton =
  'flex h-10 w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-[#1D4ED8] dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white';

/**
 * The chat window: a floating panel on wider screens, a full-screen sheet on
 * phones. Loaded lazily, the first time the launcher is used.
 */
export default function ChatPanel({
  state,
  entries,
  pending,
  hidden,
  onClose,
  onMinimize,
  onExpand,
  onSend,
  onAction,
  onNavigate,
}: ChatPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const open = state === 'open';
  const close = useCallback(() => onClose(), [onClose]);
  useFocusTrap(panelRef, open, close);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) {
    return (
      <div className="fixed bottom-6 right-4 z-40 flex items-center gap-1 rounded-full border border-[#E4E7EC] bg-white py-1 pl-4 pr-1 shadow-lg sm:right-6 dark:border-slate-700 dark:bg-slate-800">
        <button
          type="button"
          onClick={onExpand}
          className="min-h-10 text-sm font-semibold text-slate-900 focus-visible:outline-2 focus-visible:outline-[#1D4ED8] dark:text-slate-100"
        >
          Assistant
          {pending && <span className="sr-only"> (replying)</span>}
        </button>
        <button
          type="button"
          onClick={onExpand}
          aria-label="Expand assistant"
          className={iconButton}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
            <path d="M10 6.5 4.7 11.8a.75.75 0 1 0 1.06 1.06L10 8.62l4.24 4.24a.75.75 0 1 0 1.06-1.06L10 6.5Z" />
          </svg>
        </button>
        <button type="button" onClick={onClose} aria-label="Close assistant" className={iconButton}>
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        </button>
      </div>
    );
  }

  // A clicked chip disappears once answered; keep focus in the panel.
  const refocus = () => inputRef.current?.focus();
  const send = (text: string) => {
    onSend(text);
    refocus();
  };
  const handlers = {
    onSend: send,
    onAction: (...args: Parameters<typeof onAction>) => {
      onAction(...args);
      refocus();
    },
    onNavigate,
  };

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="chat-title"
      className="fixed inset-0 z-40 flex flex-col bg-white sm:inset-auto sm:bottom-6 sm:right-6 sm:h-[min(640px,calc(100dvh-3rem))] sm:w-[400px] sm:overflow-hidden sm:rounded-2xl sm:border sm:border-[#E4E7EC] sm:shadow-[0_24px_60px_-16px_rgba(12,19,34,0.35)] dark:bg-slate-800 sm:dark:border-slate-700"
    >
      <header className="flex items-center gap-3 border-b border-[#E4E7EC] py-2 pl-4 pr-2 pt-[max(0.5rem,env(safe-area-inset-top))] dark:border-slate-700">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0C1322] text-white"
          aria-hidden="true"
        >
          <ChatIcon className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h2
            id="chat-title"
            className="text-[15px] font-semibold text-slate-900 dark:text-slate-100"
          >
            Assistant
          </h2>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
            Net worth, balances and bills
          </p>
        </div>
        <button
          type="button"
          onClick={onMinimize}
          aria-label="Minimize assistant"
          className={iconButton}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
            <path d="M4 10.75a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H4.75a.75.75 0 0 1-.75-.75Z" />
          </svg>
        </button>
        <button type="button" onClick={onClose} aria-label="Close assistant" className={iconButton}>
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        </button>
      </header>

      {entries.length === 0 ? (
        <div className="flex flex-1 flex-col justify-end gap-4 overflow-y-auto px-4 py-5">
          <div>
            <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Ask about your money
            </p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              I can look up your net worth, account balances and upcoming bills.
            </p>
          </div>
          <ul className="flex flex-col gap-2" aria-label="Example questions">
            {EXAMPLE_QUESTIONS.map((q) => (
              <li key={q}>
                <button
                  type="button"
                  onClick={() => send(q)}
                  className="min-h-11 w-full rounded-xl border border-[#E4E7EC] bg-white px-4 text-left text-sm font-medium text-slate-800 transition-colors hover:border-[#BFD3F5] hover:bg-blue-50/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  {q}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <MessageList entries={entries} pending={pending} hidden={hidden} handlers={handlers} />
      )}

      <InputBox onSend={onSend} disabled={pending} inputRef={inputRef} />
    </div>
  );
}

function ChatIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M4.8 3h14.4A2.8 2.8 0 0 1 22 5.8v9.4a2.8 2.8 0 0 1-2.8 2.8H9.6l-4.3 3.6A.8.8 0 0 1 4 21v-3H4.8A2.8 2.8 0 0 1 2 15.2V5.8A2.8 2.8 0 0 1 4.8 3Zm3 6.4a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6Zm4.2 0a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6Zm4.2 0a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6Z" />
    </svg>
  );
}
