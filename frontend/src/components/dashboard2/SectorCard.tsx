import type { Holding } from '../../types';
import { concentrationNote, sectorShares } from './calc';
import { Card, Empty, SkeletonRows } from './Card';

export default function SectorCard({
  holdings,
  isLoading,
}: {
  holdings: Holding[] | undefined;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <Card title="Sector allocation">
        <SkeletonRows rows={6} />
      </Card>
    );
  }
  const sectors = sectorShares(holdings ?? []);
  if (sectors.length === 0) {
    return (
      <Card title="Sector allocation">
        <Empty>Add stock holdings to see how they spread across sectors.</Empty>
      </Card>
    );
  }
  const note = concentrationNote(sectors);
  const max = sectors[0].pct;

  return (
    <Card
      title="Sector allocation"
      aside={
        note ? (
          <span className="text-xs font-medium text-[#9A3412] dark:text-orange-300">{note}</span>
        ) : (
          <span className="text-xs text-[#5B6472] dark:text-slate-400">% of stocks</span>
        )
      }
    >
      {/* One grid for all rows, so the name column fits the longest sector name. */}
      <ul
        className="grid grid-cols-[max-content_minmax(0,1fr)_3rem] items-center gap-x-3 gap-y-2"
        aria-label="Share of stock holdings by sector"
      >
        {sectors.map((s, i) => (
          <li key={s.name} className="contents">
            <span className="text-xs text-[#0E1116] dark:text-slate-200">{s.name}</span>
            <span
              className="h-2 overflow-hidden rounded-full bg-[#F1F2F5] dark:bg-slate-700"
              aria-hidden="true"
            >
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${(s.pct / max) * 100}%`,
                  background: i === 0 ? '#1D4ED8' : '#93C5FD',
                }}
              />
            </span>
            <span className="text-right text-xs font-semibold tabular-nums text-[#0E1116] dark:text-white">
              {s.pct.toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
