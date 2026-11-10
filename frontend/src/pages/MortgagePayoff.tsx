import { useDeferredValue, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAccounts } from '../hooks';
import {
  AmortizationTable,
  BalanceChart,
  PayoffInputsPanel,
  PayoffSummary,
  comparePayoff,
  defaultInputs,
  firstPaymentMonth,
  hasChanges,
  toLoan,
  toScenario,
  type PayoffInputs,
} from '../components/mortgage';
import { EyeIcon, EyeOffIcon } from '../components/networth';
import { LoadingSpinner } from '../components/shared';
import { useUIStore } from '../store/uiStore';
import type { FinancialAccount } from '../types';

const CARD =
  'rounded-[20px] border border-ink-200 dark:border-slate-700 bg-white dark:bg-slate-800';

/** What-if calculator for paying a mortgage off early or refinancing it. */
export default function MortgagePayoff() {
  const { data: accounts, isLoading } = useAccounts();
  const [params, setParams] = useSearchParams();
  const hidden = useUIStore((s) => s.hideBalances);
  const toggleHidden = useUIStore((s) => s.toggleHideBalances);

  const mortgages = useMemo(
    () => (accounts ?? []).filter((a) => a.account_type === 'mortgage'),
    [accounts],
  );
  const requested = Number(params.get('account'));
  const selected = mortgages.find((m) => m.id === requested) ?? mortgages[0] ?? null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div
      className="-m-6 min-h-[calc(100%+3rem)] bg-ink-60 dark:bg-slate-900 px-4 py-6 sm:p-6 lg:p-8"
      style={{
        fontFamily: "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
        fontFeatureSettings: "'tnum'",
      }}
    >
      <div className="mx-auto max-w-[1240px] space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[28px] font-bold leading-tight tracking-[-0.02em] text-slate-900 dark:text-white">
              Mortgage payoff
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {selected
                ? `See what extra payments or a refinance would do to ${selected.name}`
                : 'See what extra payments or a refinance would do to your mortgage'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {mortgages.length > 1 && selected && (
              <select
                aria-label="Mortgage"
                value={selected.id}
                onChange={(e) => setParams({ account: e.target.value }, { replace: true })}
                className="h-11 max-w-[240px] rounded-full border border-ink-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 text-sm font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-accent-700/40"
              >
                {mortgages.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.institution ? `${m.name} · ${m.institution}` : m.name}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={toggleHidden}
              aria-pressed={hidden}
              aria-label={hidden ? 'Show balances' : 'Hide balances'}
              title={hidden ? 'Show balances' : 'Hide balances'}
              className="h-11 w-11 flex items-center justify-center rounded-full border border-ink-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-700"
            >
              {hidden ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
        </header>

        {selected ? (
          <Simulator key={selected.id} account={selected} hidden={hidden} />
        ) : (
          <section className={`${CARD} px-6 py-12 text-center`}>
            <p className="text-lg font-semibold text-slate-900 dark:text-white">
              No mortgage to simulate yet
            </p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Add your mortgage on the Net Worth page with its balance, rate and payoff date.
            </p>
            <Link
              to="/net-worth"
              className="mt-5 inline-flex h-10 items-center rounded-full bg-ink-900 px-5 text-sm font-semibold text-white hover:bg-ink-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-700"
            >
              Add a mortgage on Net Worth
            </Link>
          </section>
        )}
      </div>
    </div>
  );
}

function Simulator({ account, hidden }: { account: FinancialAccount; hidden: boolean }) {
  const [inputs, setInputs] = useState<PayoffInputs>(() => defaultInputs(account));
  // Typing and dragging stay smooth; the schedule catches up a frame later.
  const deferred = useDeferredValue(inputs);
  const first = useMemo(() => firstPaymentMonth(account), [account]);
  const needsPayment = useMemo(() => defaultInputs(account).payment === '', [account]);

  const loan = useMemo(() => toLoan(deferred, first), [deferred, first]);
  const scenario = useMemo(() => toScenario(deferred), [deferred]);
  const comparison = useMemo(() => (loan ? comparePayoff(loan, scenario) : null), [loan, scenario]);
  const changed = hasChanges(scenario);

  const firstYear = Number(first.slice(0, 4));
  const lastYear = Math.max(
    Number(comparison?.baseline.summary.payoffMonth?.slice(0, 4) ?? firstYear + 30),
    Number(inputs.lumpSumMonth.slice(0, 4)),
  );
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, i) => firstYear + i);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start">
      <div className="lg:sticky lg:top-6">
        <PayoffInputsPanel
          inputs={inputs}
          onChange={(patch) => setInputs((prev) => ({ ...prev, ...patch }))}
          onReset={() => setInputs(defaultInputs(account))}
          years={years}
          needsPayment={needsPayment}
          paymentTooLow={!!comparison && !comparison.baseline.summary.paidOff}
          hidden={hidden}
        />
      </div>

      <div className="min-w-0 space-y-6">
        {comparison && loan ? (
          <>
            <PayoffSummary
              comparison={comparison}
              scenario={scenario}
              changed={changed}
              hidden={hidden}
            />
            <BalanceChart
              comparison={comparison}
              startBalance={loan.balance}
              hidden={hidden}
              showScenario={changed}
            />
            <AmortizationTable
              schedule={comparison.scenario.schedule}
              hidden={hidden}
              label={changed ? 'with your changes' : 'on the current plan'}
            />
          </>
        ) : (
          <section className={`${CARD} px-6 py-10 text-center`}>
            <p className="font-semibold text-slate-900 dark:text-white">
              {account.apr == null && !inputs.apr
                ? 'This mortgage needs a rate to simulate'
                : 'Add your monthly payment to see results'}
            </p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Open Loan details and fill in the balance, rate and monthly principal & interest.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
