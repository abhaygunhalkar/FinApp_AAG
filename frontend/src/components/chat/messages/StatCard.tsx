import type { StatMessage } from '../../../types';
import { fmtAmount } from '../format';
import { card } from './styles';

export default function StatCard({ message, hidden }: { message: StatMessage; hidden: boolean }) {
  const { delta } = message;
  return (
    <div className={`${card} w-full max-w-[85%] px-4 py-3`}>
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
