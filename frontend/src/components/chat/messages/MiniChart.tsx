import {
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ChartMessage } from '../../../types';
import { fmtAmount } from '../format';

const COLORS = ['#1D4ED8', '#F97316', '#0EA5E9', '#A855F7', '#14B8A6', '#E11D48'];

/** A small chart inside a bot message. Values are USD amounts. */
export default function MiniChart({ message, hidden }: { message: ChartMessage; hidden: boolean }) {
  const money = (v: number) => fmtAmount(v, 'USD', hidden);
  // Describe the data for screen readers, since the drawing can't be read.
  const summary = message.series
    .map((s) => `${s.name}: ${s.points.map((p) => `${p.label} ${money(p.value)}`).join(', ')}`)
    .join('; ');
  const labels = Array.from(new Set(message.series.flatMap((s) => s.points.map((p) => p.label))));
  const rows = labels.map((label) => ({
    label,
    ...Object.fromEntries(
      message.series.map((s) => [s.name, s.points.find((p) => p.label === label)?.value ?? null]),
    ),
  }));
  const tooltip = (
    <Tooltip
      formatter={(v) => money(Number(v))}
      contentStyle={{ fontSize: 12, borderRadius: 8 }}
      isAnimationActive={false}
    />
  );
  const axis = { tick: { fontSize: 11, fill: '#64748B' }, tickLine: false, axisLine: false };

  return (
    <div
      role="img"
      aria-label={`${message.kind} chart. ${summary}`}
      className="h-44 w-full rounded-xl bg-white p-2 dark:bg-slate-800"
    >
      <ResponsiveContainer width="100%" height="100%">
        {message.kind === 'pie' ? (
          <PieChart>
            <Pie
              data={message.series[0].points}
              dataKey="value"
              nameKey="label"
              innerRadius="55%"
              outerRadius="85%"
              isAnimationActive={false}
            >
              {message.series[0].points.map((p, i) => (
                <Cell key={p.label} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            {tooltip}
          </PieChart>
        ) : message.kind === 'bar' ? (
          <BarChart data={rows}>
            <XAxis dataKey="label" {...axis} />
            <YAxis hide />
            {tooltip}
            {message.series.map((s, i) => (
              <Bar
                key={s.name}
                dataKey={s.name}
                fill={COLORS[i % COLORS.length]}
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        ) : (
          <LineChart data={rows}>
            <XAxis dataKey="label" {...axis} />
            <YAxis hide />
            {tooltip}
            {message.series.map((s, i) => (
              <Line
                key={s.name}
                dataKey={s.name}
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
