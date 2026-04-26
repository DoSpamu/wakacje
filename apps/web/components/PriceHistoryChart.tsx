'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export interface PricePoint {
  date: string;
  price: number;
}

interface Props {
  data: PricePoint[];
}

function formatDate(iso: string): string {
  const [, month, day] = iso.split('-');
  return `${day}.${month}`;
}

function formatPrice(v: number): string {
  return `${v.toLocaleString('pl-PL')} zl`;
}

export default function PriceHistoryChart({ data }: Props) {
  if (data.length < 2) return null;

  const min = Math.min(...data.map((d) => d.price));
  const max = Math.max(...data.map((d) => d.price));
  const trend = data[data.length - 1]!.price - data[0]!.price;

  return (
    <div>
      <div className="flex items-center gap-4 mb-3">
        <div className="text-xs text-slate-500">
          Min: <span className="font-semibold text-green-600">{min.toLocaleString('pl-PL')} zl</span>
        </div>
        <div className="text-xs text-slate-500">
          Max: <span className="font-semibold text-slate-700">{max.toLocaleString('pl-PL')} zl</span>
        </div>
        <div className="text-xs text-slate-500">
          Trend:{' '}
          <span className={trend > 0 ? 'font-semibold text-red-500' : trend < 0 ? 'font-semibold text-green-600' : 'text-slate-400'}>
            {trend > 0 ? '+' : ''}{trend.toLocaleString('pl-PL')} zl
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            tickLine={false}
            axisLine={false}
            width={32}
          />
          <Tooltip
            formatter={(value) => [formatPrice(Number(value)), 'Cena min.']}
            labelFormatter={(label) => formatDate(String(label))}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
          />
          <Line
            type="monotone"
            dataKey="price"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ r: 3, fill: '#3b82f6' }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
