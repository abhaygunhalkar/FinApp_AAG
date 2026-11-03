import { useEffect, useRef } from 'react';
import BotMessageView from './BotMessageView';
import type { ChatEntry, ChatHandlers } from './types';

interface Props {
  entries: ChatEntry[];
  /** Waiting for the bot's reply. */
  pending: boolean;
  hidden: boolean;
  handlers: ChatHandlers;
}

/** The conversation, newest at the bottom; new messages are announced. */
export default function MessageList({ entries, pending, hidden, handlers }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // Buttons only act in the bot's latest reply (after the last user message).
  const lastUser = entries.findLastIndex((e) => e.role === 'user');

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries.length, pending]);

  return (
    <div
      ref={ref}
      role="log"
      aria-live="polite"
      aria-label="Conversation"
      className="flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-4 py-4"
    >
      {entries.map((entry, i) =>
        entry.role === 'user' ? (
          <div key={entry.id} className="flex justify-end">
            <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-md bg-[#1D4ED8] px-3.5 py-2.5 text-sm text-white">
              <span className="sr-only">You: </span>
              {entry.text}
            </p>
          </div>
        ) : (
          <div key={entry.id} className="flex">
            <BotMessageView
              message={entry.message}
              hidden={hidden}
              interactive={i > lastUser}
              handlers={handlers}
            />
          </div>
        ),
      )}
      {pending && (
        <div className="flex" role="status">
          <span className="sr-only">Assistant is typing</span>
          <span
            aria-hidden="true"
            className="inline-flex gap-1 rounded-2xl rounded-tl-md bg-[#F2F4F7] px-3.5 py-3 dark:bg-slate-700"
          >
            {[0, 1, 2].map((d) => (
              <span
                key={d}
                className="h-1.5 w-1.5 rounded-full bg-slate-400 motion-safe:animate-bounce"
                style={{ animationDelay: `${d * 120}ms` }}
              />
            ))}
          </span>
        </div>
      )}
    </div>
  );
}
