import { useState, type RefObject } from 'react';

const MAX_LENGTH = 2000; // ChatRequest.message limit

interface Props {
  onSend: (text: string) => void;
  disabled?: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
}

export default function InputBox({ onSend, disabled = false, inputRef }: Props) {
  const [text, setText] = useState('');
  const canSend = !disabled && text.trim().length > 0;

  return (
    <form
      className="flex items-center gap-2 border-t border-ink-200 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-slate-700"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSend) return;
        onSend(text.trim());
        setText('');
      }}
    >
      <label htmlFor="chat-input" className="sr-only">
        Message
      </label>
      <input
        id="chat-input"
        ref={inputRef}
        type="text"
        value={text}
        maxLength={MAX_LENGTH}
        autoComplete="off"
        placeholder="Ask about balances or bills"
        onChange={(e) => setText(e.target.value)}
        className="min-h-11 min-w-0 flex-1 rounded-full border border-ink-200 bg-slate-50 px-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-accent-700 focus:outline-none focus:ring-2 focus:ring-accent-700/20 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
      />
      <button
        type="submit"
        aria-label="Send"
        disabled={!canSend}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-700 text-white transition-colors hover:bg-accent-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-700 disabled:bg-slate-300 dark:disabled:bg-slate-600"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
          <path d="M3.1 2.3a.75.75 0 0 1 .8-.1l13.5 7a.75.75 0 0 1 0 1.3l-13.5 7a.75.75 0 0 1-1-.9L4.8 10 2.9 3.4a.75.75 0 0 1 .2-1.1ZM6.2 10.75l-1.2 4.4 9.5-5.15L5 4.85l1.2 4.4h4.55a.75.75 0 0 1 0 1.5H6.2Z" />
        </svg>
      </button>
    </form>
  );
}
