import { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

// Abramowitz & Stegun normal CDF approximation
function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const poly =
    t *
    (0.3193815 +
      t * (-0.3565638 + t * (1.7814779 + t * (-1.821256 + t * 1.3302744))));
  const prob = 1 - d * poly;
  return x >= 0 ? prob : 1 - prob;
}

function bsCall(S: number, K: number, T: number, r: number, sigma: number): number {
  if (T <= 0) return Math.max(0, S - K);
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  return S * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2);
}

function parseNum(v: string): number | null {
  const n = parseFloat(v);
  return isNaN(n) || n < 0 ? null : n;
}

const fmt = (v: number) =>
  v.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

const fmtSigned = (v: number) => `${v >= 0 ? '+' : ''}${fmt(v)}`;

const RISK_FREE_RATE = 0.045;

function SummaryCard({
  label,
  value,
  valueClass = 'text-gray-900 dark:text-gray-100',
  sub,
}: {
  label: string;
  value: string;
  valueClass?: string;
  sub?: string;
}) {
  return (
    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg px-4 py-3">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${valueClass}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

const inputClass =
  'w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500';
const labelClass = 'block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1';

export default function CoveredCallSimulator() {
  const [stockPrice, setStockPrice] = useState('');
  const [costBasis, setCostBasis] = useState('');
  const [strikePrice, setStrikePrice] = useState('');
  const [premium, setPremium] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [iv, setIv] = useState('25');

  const inputs = useMemo(() => {
    const S = parseNum(stockPrice);
    const CB = parseNum(costBasis);
    const K = parseNum(strikePrice);
    const P = parseNum(premium);
    const sigma = parseNum(iv);
    if (!S || !CB || !K || !P || sigma === null || !expiryDate) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(expiryDate + 'T00:00:00');
    const daysToExpiry = Math.max(
      0,
      Math.round((expiry.getTime() - today.getTime()) / 86_400_000),
    );
    const T = daysToExpiry / 365;

    return { S, CB, K, P, sigma: sigma / 100, T, daysToExpiry };
  }, [stockPrice, costBasis, strikePrice, premium, expiryDate, iv]);

  const summary = useMemo(() => {
    if (!inputs) return null;
    const { S, CB, K, P, sigma, T } = inputs;
    const breakeven = parseFloat((CB - P).toFixed(4));
    const maxProfit = parseFloat(((K - CB + P) * 100).toFixed(2));
    const currentOptionValue = bsCall(S, K, T, RISK_FREE_RATE, sigma);
    // Covered call position P&L: stock gain/loss + premium collected - option buyback cost
    const positionPnL = parseFloat(((S - CB + P - currentOptionValue) * 100).toFixed(2));
    return { breakeven, maxProfit, currentOptionValue, positionPnL };
  }, [inputs]);

  // Payoff at expiry across a range of stock prices
  const payoffData = useMemo(() => {
    if (!inputs) return [];
    const { CB, K, P } = inputs;
    const lo = Math.max(0.01, K * 0.4);
    const hi = K * 1.6;
    const step = (hi - lo) / 80;
    const data = [];
    for (let price = lo; price <= hi + step / 2; price += step) {
      const p = parseFloat(price.toFixed(2));
      const pnl = parseFloat(
        ((p >= K ? K - CB + P : p - CB + P) * 100).toFixed(2),
      );
      data.push({ price: p, pnl });
    }
    return data;
  }, [inputs]);

  // Option value + seller gain day-by-day from today → expiry
  const decayData = useMemo(() => {
    if (!inputs) return [];
    const { S, K, sigma, daysToExpiry, P } = inputs;
    const data = [];
    const step = daysToExpiry > 180 ? 2 : 1;
    for (let day = 0; day <= daysToExpiry; day += step) {
      const daysLeft = daysToExpiry - day;
      const T = daysLeft / 365;
      const optionValue = parseFloat(bsCall(S, K, T, RISK_FREE_RATE, sigma).toFixed(4));
      const sellerGain = parseFloat(((P - optionValue) * 100).toFixed(2));
      data.push({ day, optionValue, sellerGain });
    }
    return data;
  }, [inputs]);

  const tooltipStyle = {
    fontSize: 12,
    borderRadius: '6px',
    border: '1px solid #e5e7eb',
    backgroundColor: '#fff',
  };

  return (
    <section className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm space-y-6">
      <div>
        <h2 className="text-base font-semibold text-gray-700 dark:text-gray-300">
          Covered Call Simulator
        </h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Models 1 contract (100 shares). Uses Black-Scholes with r = 4.5%.
        </p>
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <div>
          <label className={labelClass}>Stock Price ($)</label>
          <input type="number" value={stockPrice} onChange={(e) => setStockPrice(e.target.value)} placeholder="150.00" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Cost Basis ($)</label>
          <input type="number" value={costBasis} onChange={(e) => setCostBasis(e.target.value)} placeholder="140.00" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Strike Price ($)</label>
          <input type="number" value={strikePrice} onChange={(e) => setStrikePrice(e.target.value)} placeholder="160.00" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Premium ($/share)</label>
          <input type="number" value={premium} onChange={(e) => setPremium(e.target.value)} placeholder="2.50" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Expiry Date</label>
          <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Implied Vol (%)</label>
          <input type="number" value={iv} onChange={(e) => setIv(e.target.value)} placeholder="25" className={inputClass} />
        </div>
      </div>

      {!inputs && (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">
          Fill in all fields above to see the simulation.
        </p>
      )}

      {inputs && summary && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryCard
              label="Days to Expiry"
              value={String(inputs.daysToExpiry)}
              sub={`IV: ${iv}%`}
            />
            <SummaryCard
              label="Breakeven at Expiry"
              value={fmt(summary.breakeven)}
              sub="Cost basis − premium"
            />
            <SummaryCard
              label="Max Profit (1 contract)"
              value={fmt(summary.maxProfit)}
              valueClass={summary.maxProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}
              sub={`If called away at ${fmt(inputs.K)}`}
            />
            <SummaryCard
              label="Current Position P&L"
              value={fmtSigned(summary.positionPnL)}
              valueClass={summary.positionPnL >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}
              sub={`Option now worth ${fmt(summary.currentOptionValue)}`}
            />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Payoff diagram */}
            <div>
              <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-3">
                P&L at Expiry vs Stock Price (1 contract)
              </p>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={payoffData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                  <XAxis
                    dataKey="price"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `$${v}`}
                    tickCount={6}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `$${v}`}
                  />
                  <Tooltip
                    formatter={(v) => [fmt(Number(v)), 'P&L']}
                    labelFormatter={(v) => `Stock @ $${v}`}
                    contentStyle={tooltipStyle}
                  />
                  {/* Zero line */}
                  <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 2" />
                  {/* Strike */}
                  <ReferenceLine
                    x={inputs.K}
                    stroke="#f59e0b"
                    strokeDasharray="4 2"
                    label={{ value: `Strike $${inputs.K}`, fontSize: 10, fill: '#f59e0b', position: 'insideTopRight' }}
                  />
                  {/* Breakeven */}
                  <ReferenceLine
                    x={summary.breakeven}
                    stroke="#6b7280"
                    strokeDasharray="4 2"
                    label={{ value: `BE $${summary.breakeven.toFixed(2)}`, fontSize: 10, fill: '#6b7280', position: 'insideBottomLeft' }}
                  />
                  {/* Current price */}
                  <ReferenceLine
                    x={inputs.S}
                    stroke="#3b82f6"
                    strokeDasharray="4 2"
                    label={{ value: `Now $${inputs.S}`, fontSize: 10, fill: '#3b82f6', position: 'insideTopLeft' }}
                  />
                  <Line type="monotone" dataKey="pnl" stroke="#10b981" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Time decay */}
            <div>
              <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-3">
                Premium Decay Over Time (stock price held at {fmt(inputs.S)})
              </p>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={decayData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `D${v}`}
                    tickCount={6}
                    label={{ value: 'Days elapsed →', fontSize: 10, position: 'insideBottomRight', offset: -4 }}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `$${v}`}
                  />
                  <Tooltip
                    formatter={(v, name) => [
                      fmt(Number(v)),
                      name === 'optionValue' ? 'Option value (cost to close)' : 'Your unrealized gain',
                    ]}
                    labelFormatter={(v) => `Day ${v} / ${inputs.daysToExpiry}`}
                    contentStyle={tooltipStyle}
                  />
                  {/* Premium collected line */}
                  <ReferenceLine
                    y={inputs.P * 100}
                    stroke="#f59e0b"
                    strokeDasharray="4 2"
                    label={{ value: `Premium $${(inputs.P * 100).toFixed(0)}`, fontSize: 10, fill: '#f59e0b', position: 'insideTopRight' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="optionValue"
                    stroke="#8b5cf6"
                    strokeWidth={2.5}
                    dot={false}
                    name="optionValue"
                  />
                  <Line
                    type="monotone"
                    dataKey="sellerGain"
                    stroke="#10b981"
                    strokeWidth={2}
                    strokeDasharray="6 3"
                    dot={false}
                    name="sellerGain"
                  />
                </LineChart>
              </ResponsiveContainer>
              <p className="text-[10px] text-gray-400 mt-1">
                Purple: option value (what you'd pay to close) · Green dashed: your unrealized gain · Amber: premium collected
              </p>
            </div>

          </div>
        </>
      )}
    </section>
  );
}
