import { useBrokerSummary } from '../../hooks';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

// Fixed, ordered set of gradients so broker tiles stay visually distinct from
// each other AND from the metric cards around them (blue, indigo, violet,
// green, amber, red are already taken); brokers beyond this list fall back
// to slate.
const GRADIENTS = [
  'from-teal-500 to-teal-700 shadow-teal-500/20',
  'from-fuchsia-500 to-fuchsia-700 shadow-fuchsia-500/20',
  'from-cyan-500 to-cyan-700 shadow-cyan-500/20',
  'from-lime-500 to-lime-700 shadow-lime-500/20',
  'from-pink-500 to-pink-700 shadow-pink-500/20',
];
const FALLBACK_GRADIENT = 'from-slate-500 to-slate-700 shadow-slate-500/20';

// Renders one tile per broker, meant to be dropped directly into the
// dashboard's metric-cards grid (not its own grid) so it shares that layout.
export default function BrokerTiles() {
  const { data } = useBrokerSummary();

  if (!data || data.length === 0) {
    return null;
  }

  return (
    <>
      {data.map((broker, i) => {
        const gradient = GRADIENTS[i] ?? FALLBACK_GRADIENT;
        const gainColor = broker.unrealized_gain >= 0 ? 'text-green-200' : 'text-red-200';
        return (
          <div
            key={broker.broker}
            className={`rounded-xl bg-gradient-to-br p-5 shadow-lg ${gradient}`}
          >
            <p className="text-sm font-medium text-white/80">{broker.broker}</p>
            <p className="mt-2 text-2xl font-bold text-white">
              {formatCurrency(broker.market_value)}
            </p>
            <p className={`mt-1 text-sm font-semibold ${gainColor}`}>
              {broker.unrealized_gain >= 0 ? '+' : ''}
              {formatCurrency(broker.unrealized_gain)}
            </p>
            <p className="mt-1 text-xs text-white/70">
              {broker.holding_count} holding{broker.holding_count === 1 ? '' : 's'}
            </p>
          </div>
        );
      })}
    </>
  );
}
