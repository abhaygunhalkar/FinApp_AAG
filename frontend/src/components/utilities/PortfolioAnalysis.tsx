import { usePortfolioAnalysis } from '../../hooks/usePortfolioAnalysis';
import type { PortfolioInsight } from '../../api/portfolioAnalysis';
import { LoadingSpinner } from '../shared';

const CATEGORY_LABELS: Record<string, string> = {
  portfolio_health: 'Portfolio Health',
  risk: 'Risk',
  income_returns: 'Income & Returns',
  behaviour: 'Behaviour',
  options: 'Options',
  mistakes: 'Mistakes',
};

const SEVERITY_CONFIG = {
  alert: {
    border: 'border-red-400 dark:border-red-500',
    bg: 'bg-red-50 dark:bg-red-900/20',
    badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
    icon: (
      <svg className="w-4 h-4 text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
      </svg>
    ),
  },
  warning: {
    border: 'border-amber-400 dark:border-amber-500',
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
    icon: (
      <svg className="w-4 h-4 text-amber-500 dark:text-amber-400 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
      </svg>
    ),
  },
  info: {
    border: 'border-sky-400 dark:border-sky-500',
    bg: 'bg-sky-50 dark:bg-sky-900/20',
    badge: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-400',
    icon: (
      <svg className="w-4 h-4 text-sky-500 dark:text-sky-400 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
      </svg>
    ),
  },
};

function InsightCard({ insight }: { insight: PortfolioInsight }) {
  const config = SEVERITY_CONFIG[insight.severity];
  return (
    <div className={`border-l-4 ${config.border} ${config.bg} rounded-r-lg px-4 py-3`}>
      <div className="flex items-start gap-2">
        {config.icon}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {insight.title}
            </p>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${config.badge}`}>
              {CATEGORY_LABELS[insight.category] ?? insight.category}
            </span>
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
            {insight.message}
          </p>
        </div>
      </div>
    </div>
  );
}

function SeverityGroup({ severity, insights }: { severity: string; insights: PortfolioInsight[] }) {
  if (insights.length === 0) return null;
  const labels = { alert: 'Alerts', warning: 'Warnings', info: 'Insights' };
  const countColors = {
    alert: 'text-red-600 dark:text-red-400',
    warning: 'text-amber-600 dark:text-amber-400',
    info: 'text-sky-600 dark:text-sky-400',
  };
  return (
    <div>
      <h3 className={`text-xs font-bold uppercase tracking-widest mb-2 ${countColors[severity as keyof typeof countColors]}`}>
        {labels[severity as keyof typeof labels]} ({insights.length})
      </h3>
      <div className="space-y-2">
        {insights.map((ins) => (
          <InsightCard key={ins.rule_id} insight={ins} />
        ))}
      </div>
    </div>
  );
}

export default function PortfolioAnalysis() {
  const { data: insights, isLoading, isFetching, isError, refetch } = usePortfolioAnalysis();

  const alerts = insights?.filter((i) => i.severity === 'alert') ?? [];
  const warnings = insights?.filter((i) => i.severity === 'warning') ?? [];
  const infos = insights?.filter((i) => i.severity === 'info') ?? [];

  return (
    <section className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-700 dark:text-gray-300">
            Portfolio Analysis
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Rule-based insights across concentration, risk, behaviour, and options.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-1.5 text-xs text-sky-600 dark:text-sky-400 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
          </svg>
          {isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {isLoading && (
        <div className="flex justify-center py-8">
          <LoadingSpinner size="md" />
        </div>
      )}

      {isError && (
        <p className="text-sm text-red-500 dark:text-red-400">
          Failed to load analysis. Make sure the backend is running.
        </p>
      )}

      {insights && insights.length === 0 && (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">
          No insights generated — your portfolio looks clean.
        </p>
      )}

      {insights && insights.length > 0 && (
        <>
          {/* Summary strip */}
          <div className="flex gap-4 text-sm">
            {alerts.length > 0 && (
              <span className="font-semibold text-red-600 dark:text-red-400">
                {alerts.length} alert{alerts.length > 1 ? 's' : ''}
              </span>
            )}
            {warnings.length > 0 && (
              <span className="font-semibold text-amber-600 dark:text-amber-400">
                {warnings.length} warning{warnings.length > 1 ? 's' : ''}
              </span>
            )}
            {infos.length > 0 && (
              <span className="font-semibold text-sky-600 dark:text-sky-400">
                {infos.length} insight{infos.length > 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div className="space-y-5">
            <SeverityGroup severity="alert" insights={alerts} />
            <SeverityGroup severity="warning" insights={warnings} />
            <SeverityGroup severity="info" insights={infos} />
          </div>
        </>
      )}
    </section>
  );
}
