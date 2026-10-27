import type { DashboardSummary } from '../../types';
import { Card, SkeletonRows, StatRow } from './Card';
import { fmtMoney, fmtPct, fmtSigned, tone } from './format';

export default function PerformanceCard({
  summary,
  stocksRealizedYtd,
  hidden,
}: {
  summary: DashboardSummary | undefined;
  /** Sum of this year's stock sells; null while sells load. */
  stocksRealizedYtd: number | null;
  hidden: boolean;
}) {
  if (!summary || stocksRealizedYtd === null) {
    return (
      <Card title="Performance">
        <SkeletonRows rows={5} />
      </Card>
    );
  }
  const unrealPct =
    summary.total_invested > 0 ? (summary.unrealized_gain / summary.total_invested) * 100 : 0;
  const u = tone(summary.unrealized_gain);
  const e = tone(summary.etf_unrealized_gain);
  const r = tone(stocksRealizedYtd);

  return (
    <Card title="Performance">
      <div>
        <StatRow label="Total invested" value={fmtMoney(summary.total_invested, hidden)} />
        <StatRow
          label="Unrealized gain"
          value={`${fmtSigned(summary.unrealized_gain, hidden)} · ${fmtPct(unrealPct)}`}
          valueClass={u.className}
        />
        <StatRow
          indent
          label="of which ETFs"
          value={fmtSigned(summary.etf_unrealized_gain, hidden)}
          valueClass={e.className}
        />
        <StatRow
          label="Realized gain · stocks YTD"
          value={fmtSigned(stocksRealizedYtd, hidden)}
          valueClass={r.className}
        />
        <StatRow label="Cash position" value={fmtMoney(summary.cash_position, hidden)} />
      </div>
    </Card>
  );
}
