import { useState } from 'react';
import CoveredCallSimulator from '../components/utilities/CoveredCallSimulator';

type Field = 'current' | 'target' | 'percent';

function parseNum(val: string): number | null {
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

export default function Utilities() {
  const [current, setCurrent] = useState('');
  const [target, setTarget] = useState('');
  const [percent, setPercent] = useState('');

  function handleChange(field: Field, raw: string) {
    if (field === 'current') {
      setCurrent(raw);
      const c = parseNum(raw);
      const t = parseNum(target);
      const p = parseNum(percent);
      if (c !== null && c !== 0) {
        if (t !== null) setPercent(String(parseFloat((((t - c) / c) * 100).toFixed(4))));
        else if (p !== null) setTarget(String(parseFloat((c * (1 + p / 100)).toFixed(4))));
      }
    } else if (field === 'target') {
      setTarget(raw);
      const c = parseNum(current);
      const t = parseNum(raw);
      if (c !== null && c !== 0 && t !== null) {
        setPercent(String(parseFloat((((t - c) / c) * 100).toFixed(4))));
      }
    } else {
      setPercent(raw);
      const c = parseNum(current);
      const p = parseNum(raw);
      if (c !== null && p !== null) {
        setTarget(String(parseFloat((c * (1 + p / 100)).toFixed(4))));
      }
    }
  }

  const pct = parseNum(percent);
  const isPositive = pct !== null && pct > 0;
  const isNegative = pct !== null && pct < 0;

  const percentColor = isPositive
    ? 'text-emerald-600 dark:text-emerald-400'
    : isNegative
      ? 'text-red-500 dark:text-red-400'
      : 'text-gray-900 dark:text-gray-100';

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Utilities</h1>

      <section className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
        <h2 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-5">
          Price Move Calculator
        </h2>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Current Price ($)
            </label>
            <input
              type="number"
              value={current}
              onChange={(e) => handleChange('current', e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Target Price ($)
            </label>
            <input
              type="number"
              value={target}
              onChange={(e) => handleChange('target', e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              % Change
            </label>
            <input
              type="number"
              value={percent}
              onChange={(e) => handleChange('percent', e.target.value)}
              placeholder="0.00"
              className={`w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-sky-500 ${percentColor}`}
            />
          </div>
        </div>
      </section>

      <CoveredCallSimulator />
    </div>
  );
}
