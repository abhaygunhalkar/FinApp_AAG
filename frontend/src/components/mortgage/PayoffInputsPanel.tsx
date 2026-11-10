import { useId, useState, type ReactNode, type Ref } from 'react';
import { fmtMoney } from '../networth/format';
import { EXTRA_MAX, EXTRA_STEP, REFI_TERMS, parseAmount, type PayoffInputs } from './payoffInputs';
import { monthName, type YearMonth } from './simulatePayoff';

interface PayoffInputsPanelProps {
  inputs: PayoffInputs;
  onChange: (patch: Partial<PayoffInputs>) => void;
  onReset: () => void;
  /** Years a lump sum can be applied in. */
  years: number[];
  /** True when the payment couldn't be worked out and must be typed. */
  needsPayment: boolean;
  /** The payment doesn't cover the interest, so the loan never ends. */
  paymentTooLow: boolean;
  hidden: boolean;
  /** Lets the page focus the payment field when it's missing. */
  paymentRef?: Ref<HTMLInputElement>;
}

const FIELD =
  'h-10 rounded-xl border border-ink-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm tabular-nums text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-accent-700/40 focus:border-accent-700 transition';
const INPUT = `${FIELD} w-full`;
const SELECT = `${FIELD} px-2.5`;
const LABEL = 'block text-sm font-semibold text-slate-800 dark:text-slate-100';
const HINT = 'mt-0.5 text-[13px] text-slate-500 dark:text-slate-400';

function AffixInput({
  id,
  value,
  onChange,
  prefix,
  suffix,
  placeholder,
  label,
  inputRef,
}: {
  id: string;
  inputRef?: Ref<HTMLInputElement>;
  value: string;
  onChange: (value: string) => void;
  prefix?: string;
  suffix?: string;
  placeholder?: string;
  label?: string;
}) {
  return (
    <div className="relative min-w-0 flex-1">
      {prefix && (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">
          {prefix}
        </span>
      )}
      <input
        ref={inputRef}
        id={id}
        inputMode="decimal"
        aria-label={label}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`${INPUT} ${prefix ? 'pl-6' : 'pl-3'} ${suffix ? 'pr-8' : 'pr-3'}`}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">
          {suffix}
        </span>
      )}
    </div>
  );
}

function Field({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-2 border-t border-ink-100 dark:border-slate-700 pt-4">{children}</div>
  );
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

/** The what-if inputs. Every change applies immediately. */
export default function PayoffInputsPanel({
  inputs,
  onChange,
  onReset,
  years,
  needsPayment,
  paymentTooLow,
  hidden,
  paymentRef,
}: PayoffInputsPanelProps) {
  const id = useId();
  const [detailsOpen, setDetailsOpen] = useState(needsPayment);
  const lumpYear = Number(inputs.lumpSumMonth.slice(0, 4));
  const lumpMonth = Number(inputs.lumpSumMonth.slice(5));
  const setLump = (year: number, month: number): YearMonth =>
    `${year}-${String(month).padStart(2, '0')}`;

  const balance = parseAmount(inputs.balance);
  const payment = parseAmount(inputs.payment);
  const detailsSummary = [
    balance !== null ? fmtMoney(balance, hidden) : null,
    inputs.apr ? `${inputs.apr}%` : null,
    payment !== null ? `${fmtMoney(payment, hidden)}/mo` : 'payment needed',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <section className="rounded-[20px] border border-ink-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Try a change</h2>
        <button
          type="button"
          onClick={onReset}
          className="h-9 rounded-full border border-ink-250 px-3.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700/60 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-700"
        >
          Reset
        </button>
      </div>

      <Field>
        <label htmlFor={`${id}-extra`} className={LABEL}>
          Extra each month
        </label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={EXTRA_MAX}
            step={EXTRA_STEP}
            value={inputs.extraMonthly}
            onChange={(e) => onChange({ extraMonthly: Number(e.target.value) })}
            aria-label="Extra each month (slider)"
            className="min-w-0 flex-1 accent-accent-700 dark:accent-blue-300"
          />
          <div className="w-28 shrink-0">
            <AffixInput
              id={`${id}-extra`}
              prefix="$"
              value={inputs.extraMonthly ? String(inputs.extraMonthly) : ''}
              placeholder="0"
              onChange={(v) => {
                const n = parseAmount(v) ?? 0;
                onChange({ extraMonthly: Math.min(Math.max(Math.round(n), 0), EXTRA_MAX) });
              }}
            />
          </div>
        </div>
        <p className={HINT}>Goes straight to principal, up to $5,000.</p>
      </Field>

      <Field>
        <label htmlFor={`${id}-lump`} className={LABEL}>
          One-time lump sum
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[120px] flex-1">
            <AffixInput
              id={`${id}-lump`}
              prefix="$"
              placeholder="0"
              value={inputs.lumpSum}
              onChange={(v) => onChange({ lumpSum: v })}
            />
          </div>
          <span className="text-sm text-slate-500">in</span>
          <select
            aria-label="Lump sum month"
            value={lumpMonth}
            onChange={(e) => onChange({ lumpSumMonth: setLump(lumpYear, Number(e.target.value)) })}
            className={SELECT}
          >
            {MONTHS.map((m) => (
              <option key={m} value={m}>
                {monthName(m).slice(0, 3)}
              </option>
            ))}
          </select>
          <select
            aria-label="Lump sum year"
            value={lumpYear}
            onChange={(e) => onChange({ lumpSumMonth: setLump(Number(e.target.value), lumpMonth) })}
            className={SELECT}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </Field>

      <Field>
        <label htmlFor={`${id}-annual`} className={LABEL}>
          Extra once a year
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[120px] flex-1">
            <AffixInput
              id={`${id}-annual`}
              prefix="$"
              placeholder="0"
              value={inputs.annualExtra}
              onChange={(v) => onChange({ annualExtra: v })}
            />
          </div>
          <span className="text-sm text-slate-500">every</span>
          <select
            aria-label="Month of the yearly payment"
            value={inputs.annualExtraMonth}
            onChange={(e) => onChange({ annualExtraMonth: Number(e.target.value) })}
            className={SELECT}
          >
            {MONTHS.map((m) => (
              <option key={m} value={m}>
                {monthName(m)}
              </option>
            ))}
          </select>
        </div>
        <p className={HINT}>For example, part of a yearly bonus.</p>
      </Field>

      <Field>
        <div className="flex items-center justify-between gap-3">
          <span id={`${id}-refi`} className={LABEL}>
            Refinance
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={inputs.refinance}
            aria-labelledby={`${id}-refi`}
            onClick={() => onChange({ refinance: !inputs.refinance })}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-700 ${
              inputs.refinance ? 'bg-accent-700 dark:bg-blue-400' : 'bg-slate-300 dark:bg-slate-600'
            }`}
          >
            <span
              className={`absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                inputs.refinance ? 'translate-x-[22px]' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
        {inputs.refinance && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor={`${id}-rate`} className={HINT}>
                New rate
              </label>
              <AffixInput
                id={`${id}-rate`}
                suffix="%"
                value={inputs.refiRate}
                onChange={(v) => onChange({ refiRate: v })}
              />
            </div>
            <div>
              <label htmlFor={`${id}-term`} className={HINT}>
                New term
              </label>
              <select
                id={`${id}-term`}
                value={inputs.refiTermYears}
                onChange={(e) => onChange({ refiTermYears: Number(e.target.value) })}
                className={`${SELECT} w-full`}
              >
                {REFI_TERMS.map((t) => (
                  <option key={t} value={t}>
                    {t} years
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label htmlFor={`${id}-closing`} className={HINT}>
                Closing costs (paid at closing)
              </label>
              <AffixInput
                id={`${id}-closing`}
                prefix="$"
                value={inputs.refiClosing}
                onChange={(v) => onChange({ refiClosing: v })}
              />
            </div>
          </div>
        )}
        {!inputs.refinance && <p className={HINT}>Compare a new rate and term.</p>}
      </Field>

      <div className="border-t border-ink-100 dark:border-slate-700 pt-3">
        <button
          type="button"
          onClick={() => setDetailsOpen((v) => !v)}
          aria-expanded={detailsOpen}
          className="w-full flex items-center justify-between gap-3 rounded-lg py-1 text-left focus-visible:outline-2 focus-visible:outline-accent-700"
        >
          <span className="min-w-0">
            <span className={LABEL}>Loan details</span>
            <span className="block truncate text-[13px] text-slate-500 dark:text-slate-400">
              {detailsSummary}
            </span>
          </span>
          <span
            className={`text-[10px] text-slate-400 transition-transform ${detailsOpen ? 'rotate-90' : ''}`}
            aria-hidden="true"
          >
            ▶
          </span>
        </button>
        {detailsOpen && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label htmlFor={`${id}-balance`} className={HINT}>
                Balance
              </label>
              <AffixInput
                id={`${id}-balance`}
                prefix="$"
                value={inputs.balance}
                onChange={(v) => onChange({ balance: v })}
              />
            </div>
            <div>
              <label htmlFor={`${id}-apr`} className={HINT}>
                Rate (APR)
              </label>
              <AffixInput
                id={`${id}-apr`}
                suffix="%"
                value={inputs.apr}
                onChange={(v) => onChange({ apr: v })}
              />
            </div>
            <div>
              <label htmlFor={`${id}-payment`} className={HINT}>
                Monthly P&amp;I
              </label>
              <AffixInput
                id={`${id}-payment`}
                inputRef={paymentRef}
                prefix="$"
                value={inputs.payment}
                onChange={(v) => onChange({ payment: v })}
              />
            </div>
            <p className={`col-span-2 ${HINT}`}>
              {needsPayment
                ? 'Enter your monthly principal and interest (not escrow). Adding a payoff date on Net Worth fills this in.'
                : 'Worked out from your balance, rate and payoff date. Edits here only affect this page.'}
            </p>
          </div>
        )}
        {paymentTooLow && (
          <p role="alert" className="mt-2 text-[13px] text-red-600 dark:text-red-400">
            This payment doesn’t cover the monthly interest, so the loan never gets paid off.
          </p>
        )}
      </div>
    </section>
  );
}
