import { Card, Empty, SkeletonRows, StatRow } from './Card';
import type { OptionsYtd } from './calc';
import { fmtSigned, tone } from './format';

export default function OptionsCard({ ytd, hidden }: { ytd: OptionsYtd | null; hidden: boolean }) {
  const aside = <span className="text-xs text-[#5B6472] dark:text-slate-400">YTD</span>;
  if (!ytd) {
    return (
      <Card title="Options" aside={aside}>
        <SkeletonRows rows={5} />
      </Card>
    );
  }
  if (ytd.trades === 0 && ytd.realized === 0) {
    return (
      <Card title="Options" aside={aside}>
        <Empty>No options trades this year yet.</Empty>
      </Card>
    );
  }
  const kept = ytd.collected > 0 ? Math.round((ytd.net / ytd.collected) * 100) : null;

  return (
    <Card title="Options" aside={aside}>
      <div>
        <StatRow
          label="Premium collected"
          value={fmtSigned(ytd.collected, hidden)}
          valueClass={tone(ytd.collected).className}
        />
        <StatRow
          label="Premium paid"
          value={fmtSigned(-ytd.paid, hidden)}
          valueClass={tone(-ytd.paid).className}
        />
        <StatRow
          strong
          label="Net premium"
          value={fmtSigned(ytd.net, hidden)}
          valueClass={tone(ytd.net).className}
        />
        <StatRow
          strong
          label="Options realized P&L"
          value={fmtSigned(ytd.realized, hidden)}
          valueClass={tone(ytd.realized).className}
        />
      </div>
      {kept !== null && (
        <p className="mt-auto text-xs text-[#5B6472] dark:text-slate-400">
          {kept}% of premium collected kept
        </p>
      )}
    </Card>
  );
}
