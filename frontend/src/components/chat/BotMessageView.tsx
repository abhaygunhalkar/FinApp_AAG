import { Link } from 'react-router-dom';
import type { BotMessage } from '../../types';
import ChatChart from './ChatChart';
import { fmtAmount } from './format';
import type { ChatHandlers } from './types';

const bubble =
  'max-w-[85%] rounded-2xl rounded-tl-md bg-[#F2F4F7] px-3.5 py-2.5 text-sm text-slate-900 dark:bg-slate-700 dark:text-slate-100';

const chipClass =
  'min-h-9 rounded-full border border-[#BFD3F5] bg-white px-3.5 text-sm font-medium text-[#1D4ED8] transition-colors hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8] disabled:opacity-50 dark:border-blue-800 dark:bg-slate-800 dark:text-blue-300 dark:hover:bg-slate-700';

interface Props {
  message: BotMessage;
  hidden: boolean;
  /** False for earlier turns: their buttons no longer act. */
  interactive: boolean;
  handlers: ChatHandlers;
}

/** One bot message, drawn according to its type. */
export default function BotMessageView({ message, hidden, interactive, handlers }: Props) {
  switch (message.type) {
    case 'text':
      return <p className={bubble}>{message.text}</p>;

    case 'stat': {
      const delta = message.delta;
      return (
        <div className="w-full max-w-[85%] rounded-2xl border border-[#E4E7EC] bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
            {message.label}
          </p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
            {fmtAmount(message.value, message.currency, hidden)}
          </p>
          {delta !== undefined && delta !== 0 && (
            <p
              className={`mt-0.5 text-xs font-semibold tabular-nums ${
                delta > 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-[#C2410C] dark:text-orange-300'
              }`}
            >
              <span aria-hidden="true">{delta > 0 ? '▲' : '▼'} </span>
              <span className="sr-only">{delta > 0 ? 'Up' : 'Down'} </span>
              {fmtAmount(Math.abs(delta), message.currency, hidden)}
            </p>
          )}
        </div>
      );
    }

    case 'table':
      return (
        <div className="w-full overflow-x-auto rounded-2xl border border-[#E4E7EC] bg-white dark:border-slate-700 dark:bg-slate-800">
          <table className="w-full text-left text-[13px] tabular-nums">
            <thead>
              <tr className="border-b border-[#E4E7EC] dark:border-slate-700">
                {message.columns.map((c) => (
                  <th
                    key={c}
                    scope="col"
                    className="whitespace-nowrap px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {message.rows.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-[#F2F4F7] last:border-0 dark:border-slate-700/60"
                >
                  {row.map((cell, j) => (
                    <td
                      key={j}
                      className={`px-3 py-2 text-slate-800 dark:text-slate-200 ${
                        typeof cell === 'number' ? 'whitespace-nowrap text-right' : ''
                      }`}
                    >
                      {cell === null
                        ? '—'
                        : typeof cell === 'number'
                          ? fmtAmount(cell, 'USD', hidden)
                          : cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case 'chart':
      return <ChatChart message={message} hidden={hidden} />;

    case 'quickReplies':
      if (!interactive) return null;
      return (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Suggested replies">
          {message.options.map((o) => (
            <button
              key={o.label}
              type="button"
              className={chipClass}
              onClick={() => handlers.onAction(o.action, o.label)}
            >
              {o.label}
            </button>
          ))}
        </div>
      );

    case 'link':
      return (
        <Link
          to={message.route}
          onClick={handlers.onNavigate}
          className="inline-flex min-h-9 items-center gap-1 rounded-lg text-sm font-semibold text-[#1D4ED8] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8] dark:text-blue-300"
        >
          {message.label}
          <span aria-hidden="true">→</span>
        </Link>
      );

    case 'confirm':
      return (
        <div className={`${bubble} space-y-2.5`}>
          <p>{message.prompt}</p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!interactive}
              onClick={() => handlers.onAction(message.confirmAction, 'Yes')}
              className="min-h-9 rounded-lg bg-[#1D4ED8] px-4 text-sm font-semibold text-white hover:bg-[#1E40AF] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8] disabled:opacity-50"
            >
              Yes
            </button>
            <button
              type="button"
              disabled={!interactive}
              onClick={() => handlers.onAction(message.cancelAction, 'No')}
              className="min-h-9 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8] disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
            >
              No
            </button>
          </div>
        </div>
      );

    case 'error':
      return (
        <p className="max-w-[85%] rounded-2xl rounded-tl-md border border-orange-200 bg-orange-50 px-3.5 py-2.5 text-sm text-[#9A3412] dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-200">
          <span aria-hidden="true">⚠ </span>
          <span className="sr-only">Error: </span>
          {message.message}
        </p>
      );
  }
}
