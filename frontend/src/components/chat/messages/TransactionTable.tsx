import type { TableMessage } from '../../../types';
import { fmtAmount } from '../format';
import { card } from './styles';

/** Rows of bills, accounts or transactions. Number cells are USD amounts. */
export default function TransactionTable({
  message,
  hidden,
}: {
  message: TableMessage;
  hidden: boolean;
}) {
  return (
    <div className={`${card} w-full overflow-x-auto`}>
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
                  // One line per row: long names are cut off, with the full
                  // text on hover; the table scrolls sideways if needed.
                  title={typeof cell === 'string' ? cell : undefined}
                  className={`whitespace-nowrap px-3 py-2 text-slate-800 dark:text-slate-200 ${
                    typeof cell === 'number' ? 'text-right' : 'max-w-40 truncate'
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
}
