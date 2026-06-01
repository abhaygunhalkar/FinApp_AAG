import { useMemo } from 'react';
import { useEarningsCalendar } from '../hooks/useEarningsCalendar';
import { LoadingSpinner, EmptyState } from '../components/shared';
import { parseLocalDateString } from '../utils/date';
import type { EarningsCalendarEntry } from '../types/earnings';

function getDateLabel(dateString: string): string {
  const dateValue = parseLocalDateString(dateString);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const dayAfter = new Date(today);
  dayAfter.setDate(today.getDate() + 2);

  if (dateValue.toDateString() === today.toDateString()) {
    return 'Today';
  }
  if (dateValue.toDateString() === tomorrow.toDateString()) {
    return 'Tomorrow';
  }
  if (dateValue.toDateString() === dayAfter.toDateString()) {
    return 'Day After';
  }

  return dateValue.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatRevenue(value: number | null): string {
  if (value == null) {
    return 'N/A';
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatEps(value: number | null): string {
  return value == null ? 'N/A' : value.toFixed(2);
}

function getHourLabel(hour: string): string {
  return hour.toLowerCase() === 'amc' ? 'AMC' : 'BMO';
}

function getBadgeClass(hour: string): string {
  return hour.toLowerCase() === 'amc'
    ? 'bg-sky-100 text-sky-800'
    : 'bg-emerald-100 text-emerald-800';
}

export default function EarningsCalendar() {
  const { data: earnings, isLoading, isError, error } = useEarningsCalendar();

  const groupedEarnings = useMemo(() => {
    const groups = new Map<string, EarningsCalendarEntry[]>();

    if (!earnings) {
      return groups;
    }

    earnings.forEach((item) => {
      const label = getDateLabel(item.date);
      const group = groups.get(label) ?? [];
      group.push(item);
      groups.set(label, group);
    });

    groups.forEach((items) => {
      items.sort((a, b) => {
        if (a.date !== b.date) {
          return a.date.localeCompare(b.date);
        }
        if (a.hour === b.hour) {
          return a.ticker.localeCompare(b.ticker);
        }
        return a.hour.toLowerCase() === 'bmo' ? -1 : 1;
      });
    });

    return groups;
  }, [earnings]);

  const pageTitle = 'Earnings Calendar';

  if (isLoading) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center py-16">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-4">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
          {pageTitle}
        </h1>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 dark:border-red-700/40 dark:bg-red-900/20">
          <p className="text-sm text-red-700 dark:text-red-300">
            Unable to load the earnings calendar. {error instanceof Error ? error.message : 'Please try again later.'}
          </p>
        </div>
      </div>
    );
  }

  const hasData = earnings && earnings.length > 0;

  return (
    <div className="space-y-6">
      <div className="mb-4">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">{pageTitle}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-2xl">
          Upcoming earnings announcements from major companies for the next three days, including before market open (BMO) and after market close (AMC).
        </p>
      </div>

      {!hasData ? (
        <EmptyState
          icon={
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-12 w-12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 7h18" />
              <path d="M8 3v4" />
              <path d="M16 3v4" />
              <path d="M5 21h14a2 2 0 002-2V7H3v12a2 2 0 002 2z" />
            </svg>
          }
          title="No earnings found"
          description="There are no major earnings announcements in the next three days. Check back later for updates."
        />
      ) : (
        <div className="space-y-8">
          {[...groupedEarnings.entries()].map(([label, items]) => (
            <section key={label} className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{label}</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{items.length} announcement{items.length === 1 ? '' : 's'}</p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((item) => (
                  <div
                    key={`${item.ticker}-${item.date}-${item.hour}`}
                    className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-lg dark:border-slate-700 dark:bg-slate-900"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">{item.company}</p>
                        <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">{item.ticker}</p>
                      </div>
                      <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${getBadgeClass(item.hour)}`}>
                        {getHourLabel(item.hour)}
                      </span>
                    </div>

                    <div className="mt-5 space-y-3 text-sm text-slate-700 dark:text-slate-300">
                      <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-3 dark:bg-slate-800">
                        <span className="text-slate-500">EPS Estimate</span>
                        <span className="font-semibold">{formatEps(item.epsEstimate)}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-3 dark:bg-slate-800">
                        <span className="text-slate-500">Revenue Estimate</span>
                        <span className="font-semibold">{formatRevenue(item.revenueEstimate)}</span>
                      </div>
                      <div className="rounded-2xl bg-slate-50 px-3 py-3 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                        {parseLocalDateString(item.date).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
